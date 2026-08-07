"""Build the deployable DINOv2 card index from the public Pokemon TCG data mirror."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import time
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from fast_match import _Embedder, _IMG_DIR, _INDEX_PATH, _META_PATH, _embed_one


CATALOG_ARCHIVE = (
    "https://github.com/PokemonTCG/pokemon-tcg-data/"
    "archive/refs/heads/master.zip"
)
MODEL_URL = (
    "https://huggingface.co/sefaburak/dinov2-small-onnx/"
    "resolve/main/dinov2_vits14.onnx"
)
EXPECTED_MODEL_SHA256 = (
    "4df36ef0716a8f17d984fc7546a3a5d670fda6911eb298592250cb9e26756063"
)
ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "dinov2_vits14_224.onnx"
BUILD_CACHE = ROOT / ".build-cache"
ARCHIVE_PATH = BUILD_CACHE / "pokemon-tcg-data-master.zip"
MANIFEST_PATH = ROOT / "fast_index_manifest.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_catalog_archive() -> None:
    if ARCHIVE_PATH.exists() and ARCHIVE_PATH.stat().st_size > 1_000_000:
        return
    BUILD_CACHE.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        CATALOG_ARCHIVE, headers={"User-Agent": "TCGTracker-index-builder/1.0"}
    )
    temporary = ARCHIVE_PATH.with_suffix(".tmp")
    with urllib.request.urlopen(request, timeout=120) as response:
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
    temporary.replace(ARCHIVE_PATH)

def _ensure_model() -> str:
    if MODEL_PATH.exists() and _sha256(MODEL_PATH) == EXPECTED_MODEL_SHA256:
        return EXPECTED_MODEL_SHA256
    request = urllib.request.Request(
        MODEL_URL, headers={"User-Agent": "TCGTracker-index-builder/1.0"}
    )
    temporary = MODEL_PATH.with_suffix(".tmp")
    with urllib.request.urlopen(request, timeout=180) as response:
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
    model_hash = _sha256(temporary)
    if model_hash != EXPECTED_MODEL_SHA256:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Unexpected DINOv2 model SHA-256: {model_hash}")
    temporary.replace(MODEL_PATH)
    return model_hash


def load_catalog_rows() -> list[dict]:
    _download_catalog_archive()
    rows: list[dict] = []
    seen: set[str] = set()
    with zipfile.ZipFile(ARCHIVE_PATH) as archive:
        set_catalog_path = next(
            name for name in archive.namelist() if name.endswith("/sets/en.json")
        )
        with archive.open(set_catalog_path) as handle:
            sets_by_id = {item["id"]: item["name"] for item in json.load(handle)}
        card_files = sorted(
            name
            for name in archive.namelist()
            if "/cards/en/" in name and name.endswith(".json")
        )
        for name in card_files:
            set_id = Path(name).stem
            set_name = sets_by_id.get(set_id, set_id)
            with archive.open(name) as handle:
                cards = json.load(handle)
            for card in cards:
                card_id = str(card.get("id", "")).strip()
                images = card.get("images") or {}
                image_small = images.get("small")
                if not card_id or card_id in seen or not image_small:
                    continue
                seen.add(card_id)
                rows.append(
                    {
                        "card_id": card_id,
                        "name": str(card.get("name", "Unknown")),
                        "set": set_name,
                        "number": str(card.get("number", "") or ""),
                        "image_small": image_small,
                        "image_large": images.get("large") or image_small,
                    }
                )
    if not rows:
        raise RuntimeError("The static Pokemon TCG catalog contained no cards")
    return rows


def build(workers: int, keep_images: bool) -> dict:
    model_hash = _ensure_model()

    rows = load_catalog_rows()
    os.makedirs(_IMG_DIR, exist_ok=True)
    embedder = _Embedder()
    embedder.embed(np.zeros((100, 100, 3), dtype=np.float32) + 0.5)

    started = time.time()
    vectors_by_id: dict[str, np.ndarray | None] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_embed_one, row, embedder): row["card_id"] for row in rows}
        for completed, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            card_id = futures[future]
            try:
                vectors_by_id[card_id] = future.result()
            except Exception:
                vectors_by_id[card_id] = None
            if completed % 250 == 0:
                print(f"Embedded {completed}/{len(rows)} cards", flush=True)

    vectors: list[np.ndarray] = []
    metadata: list[dict] = []
    for row in rows:
        vector = vectors_by_id.get(row["card_id"])
        if vector is None:
            continue
        vectors.append(vector)
        metadata.append(row)
    if len(vectors) < 100:
        raise RuntimeError(f"Only {len(vectors)} card images could be embedded")

    matrix = np.stack(vectors).astype(np.float16)
    index_tmp = Path(f"{_INDEX_PATH}.tmp.npz")
    meta_tmp = Path(f"{_META_PATH}.tmp")
    np.savez_compressed(index_tmp, embeddings=matrix)
    with meta_tmp.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, separators=(",", ":"))
    index_tmp.replace(_INDEX_PATH)
    meta_tmp.replace(_META_PATH)

    manifest = {
        "schemaVersion": 1,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "catalog": CATALOG_ARCHIVE,
        "model": {
            "source": MODEL_URL,
            "sha256": model_hash,
        },
        "catalogCards": len(rows),
        "indexedCards": len(metadata),
        "failedCards": len(rows) - len(metadata),
        "embeddingDimension": int(matrix.shape[1]),
        "storageType": "float16",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if not keep_images:
        shutil.rmtree(_IMG_DIR, ignore_errors=True)

    summary = {
        **manifest,
        "elapsedSeconds": round(time.time() - started, 1),
        "indexBytes": Path(_INDEX_PATH).stat().st_size,
    }
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--keep-images", action="store_true")
    arguments = parser.parse_args()
    build(max(1, arguments.workers), arguments.keep_images)
