"""
Fast image-embedding card matcher.

Replaces the 5-10s EasyOCR word-match path with:
  1. Card detection + perspective warp (OpenCV)   ~5-15 ms
  2. DINOv2 ViT-S/14 embedding (ONNX, CPU)
  3. Exact cosine search over precomputed index   ~5-15 ms

Reference embeddings are built once by build_embeddings.py from the
pokemon-card-recognizer reference pickles (cards carry pokemontcg.io image
URLs). Index data lives next to this file:

  fast_index.npz          (N x D float32, L2-normalized embeddings)
  fast_index_meta.json    (per-row: card_id, name, set, number, image URLs)
  ref_images/<card_id>.png (downloaded card fronts, cached for rebuilds)

OCR (word-match + number strip) remains as the fallback in app.py for
ambiguous / low-confidence matches.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import sys
import time
import urllib.request

import cv2
import numpy as np

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_INDEX_PATH = os.path.join(_BASE_DIR, "fast_index.npz")
_META_PATH = os.path.join(_BASE_DIR, "fast_index_meta.json")
_IMG_DIR = os.path.join(_BASE_DIR, "ref_images")
_ONNX_MODEL = os.path.join(_BASE_DIR, "dinov2_vits14_224.onnx")
_EMBED_DIM = 384  # DINOv2-ViT-S/14 output
_IMG_SIZE = 224

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

# Confident match: cosine at or above this, with a clear gap over 2nd place.
MATCH_THRESHOLD = 0.70
MATCH_GAP = 0.02


class _Embedder:
    """Lazy-loaded DINOv2-ViT-S/14 embedder (384-d, ONNX Runtime CPU)."""

    def __init__(self) -> None:
        self._sess = None
        self._in_name = "input"

    def _load(self):
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = max(
            1, int(os.environ.get("SCANNER_ONNX_THREADS", min(2, os.cpu_count() or 1)))
        )
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        requested_provider = os.environ.get("SCANNER_ONNX_PROVIDER", "CPUExecutionProvider")
        available_providers = ort.get_available_providers()
        provider = (
            requested_provider
            if requested_provider in available_providers
            else "CPUExecutionProvider"
        )
        if provider == "DmlExecutionProvider":
            so.enable_mem_pattern = False
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self._sess = ort.InferenceSession(_ONNX_MODEL, so, providers=[provider])
        self._in_name = self._sess.get_inputs()[0].name
        # warm-up with the production input shape
        warm = np.zeros((1, 3, _IMG_SIZE, _IMG_SIZE), dtype=np.float32)
        output = self._sess.run(None, {self._in_name: warm})[0].reshape(-1)
        if output.size != _EMBED_DIM:
            raise RuntimeError(
                f"DINOv2 output has {output.size} values; expected {_EMBED_DIM}"
            )

    def embed(self, rgb: np.ndarray) -> np.ndarray:
        """rgb: float32 HxWx3 [0..1] (any aspect). Returns L2-normalized 384-d vector."""
        if self._sess is None:
            self._load()
            if self._sess is None:
                raise RuntimeError("Embedder failed to initialise")

        x = _resize_square(rgb)  # CHW, ImageNet-normalized, [1,3,224,224]
        out = self._sess.run(None, {self._in_name: x[None, ...]})[0].reshape(-1)
        vec = out.astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec


def _resize_square(rgb: np.ndarray) -> np.ndarray:
    """Resize any aspect image to 224x224, preserving full content (no crop).
    Returns float32 CHW, ImageNet-normalized (ready for the model)."""
    import cv2

    h, w = rgb.shape[:2]
    long_side = max(h, w)
    scale = _IMG_SIZE / long_side
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    small = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((_IMG_SIZE, _IMG_SIZE, 3), dtype=np.float32)
    x0, y0 = (_IMG_SIZE - nw) // 2, (_IMG_SIZE - nh) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = small
    return (canvas.transpose(2, 0, 1) - _IMAGENET_MEAN) / _IMAGENET_STD


# ── Card detection / warp (query side) ────────────────────────────────────────

def detect_and_warp(image_bgr: np.ndarray) -> tuple[np.ndarray | None, dict]:
    """
    Detect the card quad via OpenCV and perspective-warp it to a canonical
    portrait rectangle (245x342, ~63:88 Pokemon ratio).

    Returns (warped_bgr_or_None, info). info includes found/fills_frame.
    """
    import cv2

    info: dict = {"found": False, "tilt_deg": 0.0, "fills_frame": False}
    h, w = image_bgr.shape[:2]
    img_area = h * w

    # Downscale long side to ~800px for fast contour work
    scale = 800.0 / max(h, w)
    small = image_bgr if scale >= 1.0 else cv2.resize(image_bgr, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(gray, 50, 150)
    edged = cv2.dilate(edged, None, iterations=2)
    contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * (scale ** 2) * 0.04:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        rect = cv2.minAreaRect(c)
        cw, ch = rect[1]
        if min(cw, ch) < 40:
            continue
        aspect = max(cw, ch) / float(max(1, min(cw, ch)))
        if not (1.15 <= aspect <= 1.75):
            continue
        fill_ratio = area / float(max(1.0, cw * ch))
        if len(approx) == 4:
            quad = approx
        elif fill_ratio >= 0.55:
            # Rounded corners, glare, fingers, and busy backgrounds frequently
            # produce 5–10 contour points even when the card rectangle is clear.
            quad = cv2.boxPoints(rect).reshape(4, 1, 2)
        else:
            continue
        candidates.append((area, quad, aspect))

    if not candidates:
        return None, info

    candidates.sort(key=lambda t: -t[0])
    quad = candidates[0][1].reshape(4, 2).astype(np.float32)
    # scale back to original coordinates
    if scale < 1.0:
        quad = quad / scale

    def _order(pts: np.ndarray) -> np.ndarray:
        s = pts.sum(axis=1)
        d = np.diff(pts, axis=1).reshape(-1)
        rect = np.zeros((4, 2), dtype=np.float32)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        rect[1] = pts[np.argmin(d)]
        rect[3] = pts[np.argmax(d)]
        return rect

    quad = _order(quad)
    (tl, tr, br, bl) = quad
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_w = max(int(width_a), int(width_b))
    max_h = max(int(height_a), int(height_b))
    if max_w < 40 or max_h < 40:
        return None, info

    # Always warp to the canonical reference aspect (245x342); the reference
    # embeddings were built from full-card fronts at this exact geometry.
    out_w, out_h = 245, 342

    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
    try:
        M = cv2.getPerspectiveTransform(quad, dst)
        warped = cv2.warpPerspective(image_bgr, M, (out_w, out_h))
    except cv2.error:
        return None, info

    info["found"] = True
    info["fills_frame"] = (cv2.contourArea(candidates[0][1]) / (img_area * (scale ** 2))) > 0.85
    return warped, info


# ── Index loading / matching ──────────────────────────────────────────────────

class FastMatcher:
    """Precomputed embedding index with exact cosine search."""

    def __init__(self, index_path: str = _INDEX_PATH, meta_path: str = _META_PATH) -> None:
        self._embedder = _Embedder()
        self.matrix: np.ndarray | None = None
        self.meta: list[dict] = []
        self.loaded = False
        self.load(index_path, meta_path)
        if self.loaded:
            # Eager warmup: session creation + first inference take ~600ms,
            # never pay it on the first scan request.
            warm = np.zeros((100, 100, 3), dtype=np.float32) + 0.5
            self._embedder.embed(warm)

    def load(self, index_path: str, meta_path: str) -> bool:
        if not os.path.exists(index_path) or not os.path.exists(meta_path):
            return False
        data = np.load(index_path, allow_pickle=False)
        self.matrix = data["embeddings"].astype(np.float32)
        with open(meta_path, "r", encoding="utf-8") as f:
            self.meta = json.load(f)
        if self.matrix.shape[0] != len(self.meta):
            raise RuntimeError("fast_index.npz / meta mismatch")
        self.loaded = True
        return True

    @property
    def size(self) -> int:
        return self.matrix.shape[0] if self.matrix is not None else 0

    def match(self, rgb: np.ndarray, top_k: int = 5) -> list[dict]:
        """rgb: float32 HxWx3 [0..1]. Returns top-k matches with scores."""
        if self.matrix is None or not self.loaded:
            return []
        q = self._embedder.embed(rgb)
        scores = self.matrix @ q  # (N,) cosine since both normalized
        top_idx = np.argpartition(-scores, min(top_k, len(scores) - 1))[:top_k]
        order = top_idx[np.argsort(-scores[top_idx])]
        return [
            {
                "score": float(scores[i]),
                "card_id": self.meta[i].get("card_id"),
                "name": self.meta[i].get("name"),
                "set": self.meta[i].get("set"),
                "number": self.meta[i].get("number", ""),
                "image": {"small": self.meta[i].get("image_small"), "large": self.meta[i].get("image_large")},
            }
            for i in order
        ]

    def confident(self, results: list[dict]) -> bool:
        if not results:
            return False
        top, second = results[0]["score"], results[1]["score"] if len(results) > 1 else 0.0
        if top >= MATCH_THRESHOLD and (top - second) >= MATCH_GAP:
            return True
        if len(results) > 1 and top >= 0.82:
            first_identity = (
                str(results[0].get("name", "")).strip().casefold(),
                str(results[0].get("number", "")).strip().casefold(),
            )
            second_identity = (
                str(results[1].get("name", "")).strip().casefold(),
                str(results[1].get("number", "")).strip().casefold(),
            )
            return first_identity == second_identity and all(first_identity)
        return False

    def match_photo(self, image_bgr: np.ndarray) -> tuple[list[dict], dict]:
        """
        Match a phone photo (BGR ndarray). Detects + warps the card, embeds,
        and searches. Falls back to the full frame when no card quad is found.
        Returns (results, timing_info).
        """
        import time as _time

        timing: dict = {"detected": False, "detect_ms": 0.0, "embed_ms": 0.0, "search_ms": 0.0}
        t0 = _time.time()
        warped, det_info = detect_and_warp(image_bgr)
        timing["detect_ms"] = (_time.time() - t0) * 1000.0
        timing["detected"] = bool(det_info.get("found"))

        candidates: list[list[dict]] = []
        if warped is not None:
            rgb = cv2.cvtColor(warped, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            t1 = _time.time()
            candidates.append(self.match(rgb))
            timing["embed_ms"] += (_time.time() - t1) * 1000.0

        # Full-frame fallback (handles: no quad found, or warp gave worse score).
        # Downscale first — embedding is resolution-independent beyond ~320px.
        h, w = image_bgr.shape[:2]
        if max(h, w) > 800:
            sc = 800.0 / max(h, w)
            full_small = cv2.resize(image_bgr, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA)
        else:
            full_small = image_bgr
        rgb_full = cv2.cvtColor(full_small, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        t1 = _time.time()
        candidates.append(self.match(rgb_full))
        timing["embed_ms"] += (_time.time() - t1) * 1000.0

        best = max(candidates, key=lambda r: r[0]["score"] if r else -1.0)
        timing["search_ms"] = timing["embed_ms"]
        timing["source"] = "warped" if (warped is not None and candidates[0] and best is candidates[0]) else "full_frame"
        return best, timing


# ── Offline index builder ─────────────────────────────────────────────────────

def _download_image(url: str, dest: str, timeout: float = 20.0) -> bool:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TCGTracker-scanner/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        if len(data) < 500:
            return False
        tmp = dest + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
        return True
    except Exception:
        return False


def _load_reference_cards() -> list:
    """Load CardReference objects from all built set pickles."""
    from card_recognizer.reference.core.build import ReferenceBuild

    ref_dir = ReferenceBuild.get_path()
    pickles = sorted(f for f in os.listdir(ref_dir) if f.endswith(".pkl"))
    if not pickles:
        raise RuntimeError("No reference pickles found; run build_reference.py first")

    import pickle

    refs = []
    for f in pickles:
        with open(os.path.join(ref_dir, f), "rb") as fh:
            refs.append(pickle.load(fh))
    return refs


def _card_rows(refs: list) -> list[dict]:
    rows = []
    seen: set[str] = set()
    for ref in refs:
        for card in getattr(ref, "cards", []):
            card_id = getattr(card, "id", None)
            if not card_id or card_id in seen:
                continue
            seen.add(card_id)
            images = getattr(card, "images", None)
            small = getattr(images, "small", None) if images else None
            large = getattr(images, "large", None) if images else None
            s = getattr(card, "set", None)
            set_name = s if isinstance(s, str) else (getattr(s, "name", str(s)) if s else "Unknown")
            rows.append({
                "card_id": card_id,
                "name": str(getattr(card, "name", "Unknown")),
                "set": set_name,
                "number": str(getattr(card, "number", "") or ""),
                "image_small": small,
                "image_large": large,
            })
    return rows


def _fetch_sets_from_api(api_key: str = "DEMO") -> list[dict]:
    """Fetch all sets from the pokemontcg.io API (covers sets missing from the
    package reference, e.g. all Scarlet & Violet era after sv1)."""
    import time as _time

    sets = []
    try:
        req = urllib.request.Request(
            "https://api.pokemontcg.io/v2/sets?pageSize=250",
            headers={"User-Agent": "TCGTracker-scanner/1.0", "X-Api-Key": api_key},
        )
        with urllib.request.urlopen(req, timeout=40) as resp:
            sets = json.load(resp)["data"]
    except Exception as exc:
        print(f"  [extend] could not fetch sets: {exc}")
        return []
    return sets


def _fetch_cards_for_sets(set_ids: list[str], api_key: str = "DEMO") -> list[dict]:
    """Fetch all cards for the given set ids from pokemontcg.io (paginated)."""
    import time as _time

    rows: list[dict] = []
    for sid in set_ids:
        page = 1
        while True:
            url = (
                f"https://api.pokemontcg.io/v2/cards?q=set.id:{sid}"
                f"&page={page}&pageSize=250"
            )
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "TCGTracker-scanner/1.0", "X-Api-Key": api_key}
                )
                with urllib.request.urlopen(req, timeout=40) as resp:
                    data = json.load(resp)
            except Exception as exc:
                print(f"  [extend] set {sid} page {page} failed: {exc}")
                break
            cards = data.get("data", [])
            if not cards:
                break
            for c in cards:
                cid = c.get("id", "")
                imgs = c.get("images", {}) or {}
                set_info = c.get("set", {}) or {}
                rows.append({
                    "card_id": cid,
                    "name": str(c.get("name", "Unknown")),
                    "set": str(set_info.get("name", "Unknown")),
                    "number": str(c.get("number", "") or ""),
                    "image_small": imgs.get("small"),
                    "image_large": imgs.get("large"),
                })
            page += 1
            _time.sleep(0.25)
        print(f"  [extend] {sid}: {len([r for r in rows if r['card_id'].startswith(sid + '-')])} cards")
    return rows


def extend_index(api_key: str = "DEMO", workers: int = 8, verbose: bool = True) -> dict:
    """Append cards from pokemontcg.io sets that are missing from the index."""
    embedder = _Embedder()
    matcher = FastMatcher()
    if not matcher.loaded:
        raise RuntimeError("Index not built; run build_index() first")

    indexed_ids = {m["card_id"] for m in matcher.meta}
    api_sets = _fetch_sets_from_api(api_key)
    missing_sets = [
        s["id"]
        for s in api_sets
        if s.get("total") and all(not m.get("card_id", "").startswith(s["id"] + "-") for m in matcher.meta)
    ]
    if verbose:
        print(f"API sets: {len(api_sets)}, missing from index: {len(missing_sets)}")
        print("Missing:", missing_sets)

    new_rows = _fetch_cards_for_sets(missing_sets, api_key)
    new_rows = [r for r in new_rows if r["card_id"] not in indexed_ids]
    if not new_rows:
        return {"added": 0, "total": matcher.size}

    t0 = time.time()
    vectors = []
    meta_rows = []
    failed = 0
    for i, r in enumerate(new_rows):
        v = _embed_one(r, embedder)
        if v is None:
            failed += 1
            continue
        vectors.append(v)
        meta_rows.append(r)
        if verbose and (i + 1) % 200 == 0:
            print(f"  …{i + 1}/{len(new_rows)}")

    all_vectors = np.concatenate([matcher.matrix, np.stack(vectors)])
    all_meta = matcher.meta + meta_rows
    with open(_META_PATH, "w", encoding="utf-8") as f:
        json.dump(all_meta, f)
    np.savez_compressed(_INDEX_PATH, embeddings=all_vectors.astype(np.float16))

    summary = {
        "added": int(len(vectors)),
        "failed": failed,
        "total": int(all_vectors.shape[0]),
        "elapsed_sec": round(time.time() - t0, 1),
    }
    if verbose:
        print(f"Extended: +{summary['added']} cards (now {summary['total']}), "
              f"{summary['failed']} failed, {summary['elapsed_sec']}s")
    return summary


def _embed_one(row: dict, embedder: _Embedder) -> np.ndarray | None:
    import cv2

    if not row["image_small"]:
        return None
    url = row["image_small"]
    safe = row["card_id"].replace("/", "_")
    dest = os.path.join(_IMG_DIR, safe + ".png")
    if not _download_image(url, dest):
        return None
    img = cv2.imread(dest, cv2.IMREAD_COLOR)
    if img is None:
        return None
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return embedder.embed(rgb)


def build_index(verbose: bool = True, workers: int = 8) -> dict:
    """Build fast_index.npz + fast_index_meta.json from reference card images."""
    os.makedirs(_IMG_DIR, exist_ok=True)
    embedder = _Embedder()
    embedder.embed(np.zeros((100, 100, 3), dtype=np.float32) + 0.5)

    t0 = time.time()
    rows = _card_rows(_load_reference_cards())
    if verbose:
        print(f"Cards to embed: {len(rows)}")

    vectors: list[np.ndarray] = []
    meta_rows: list[dict] = []
    missing = 0
    failed_ids: list[str] = []

    if workers > 1:
        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(_embed_one, r, embedder): r["card_id"] for r in rows}
            done = 0
            for fut in concurrent.futures.as_completed(futures):
                done += 1
                cid = futures[fut]
                try:
                    results[cid] = fut.result()
                except Exception:
                    results[cid] = None
                if verbose and done % 500 == 0:
                    print(f"  …{done}/{len(rows)} ({(done / len(rows)) * 100:.0f}%)")
        for r in rows:
            v = results.get(r["card_id"])
            if v is None:
                missing += 1
                failed_ids.append(r["card_id"])
                continue
            vectors.append(v)
            meta_rows.append(r)
    else:
        for i, r in enumerate(rows):
            v = _embed_one(r, embedder)
            if v is None:
                missing += 1
                failed_ids.append(r["card_id"])
                continue
            vectors.append(v)
            meta_rows.append(r)
            if verbose and (i + 1) % 500 == 0:
                print(f"  …{i + 1}/{len(rows)}")

    matrix = np.stack(vectors).astype(np.float32)
    with open(_META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta_rows, f)
    np.savez_compressed(_INDEX_PATH, embeddings=matrix.astype(np.float16))

    summary = {
        "indexed": int(matrix.shape[0]),
        "failed": missing,
        "elapsed_sec": round(time.time() - t0, 1),
        "path": _INDEX_PATH,
    }
    if verbose:
        print(f"Indexed {summary['indexed']} cards in {summary['elapsed_sec']}s "
              f"({summary['failed']} failed to download)")
        if failed_ids[:10]:
            print("Sample failures:", failed_ids[:10])
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build the fast embedding index")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--check", action="store_true", help="Load existing index and report")
    parser.add_argument("--extend", action="store_true",
                        help="Append cards from missing pokemontcg.io sets")
    parser.add_argument("--api-key", default="DEMO", help="pokemontcg.io API key")
    args = parser.parse_args()

    if args.check:
        m = FastMatcher()
        if m.loaded:
            print(f"Index ready: {m.size} cards @ {_INDEX_PATH}")
        else:
            print("Index NOT built. Run without --check to build it.")
        sys.exit(0 if m.loaded else 1)

    if args.extend:
        print(extend_index(api_key=args.api_key, workers=args.workers))
        sys.exit(0)

    print(build_index(workers=args.workers))
