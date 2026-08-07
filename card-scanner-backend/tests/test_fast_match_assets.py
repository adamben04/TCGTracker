import json
import sys
import unittest
from pathlib import Path


SCANNER_DIR = Path(__file__).resolve().parents[1]
if str(SCANNER_DIR) not in sys.path:
    sys.path.insert(0, str(SCANNER_DIR))

import app as scanner_app


class FastMatcherAssetTests(unittest.TestCase):
    def test_deployable_fast_matcher_assets_are_loaded(self):
        matcher = scanner_app._fast_matcher
        self.assertTrue(scanner_app._fast_ready)
        self.assertIsNotNone(matcher)
        self.assertTrue(matcher.loaded)
        self.assertGreater(matcher.size, 18_000)
        self.assertEqual(matcher.matrix.shape[1], 384)
        self.assertEqual(matcher.size, len(matcher.meta))
        self.assertEqual(len({row["card_id"] for row in matcher.meta}), matcher.size)
        self.assertTrue(all(row.get("set") not in (None, "", "Unknown") for row in matcher.meta))

        manifest = json.loads(
            (SCANNER_DIR / "fast_index_manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["indexedCards"], matcher.size)
        self.assertEqual(manifest["embeddingDimension"], 384)
        self.assertEqual(manifest["storageType"], "float16")


if __name__ == "__main__":
    unittest.main()
