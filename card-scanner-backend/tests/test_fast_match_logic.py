import sys
import unittest
from pathlib import Path

import cv2
import numpy as np


SCANNER_DIR = Path(__file__).resolve().parents[1]
if str(SCANNER_DIR) not in sys.path:
    sys.path.insert(0, str(SCANNER_DIR))

from fast_match import FastMatcher, detect_and_warp


class FastMatchLogicTests(unittest.TestCase):
    def test_detects_card_rectangle_with_non_quadrilateral_contour(self):
        image = np.full((600, 450, 3), 35, dtype=np.uint8)
        cv2.rectangle(image, (95, 110), (355, 474), (30, 210, 240), -1)
        cv2.rectangle(image, (112, 128), (338, 456), (220, 220, 220), -1)
        cv2.circle(image, (95, 292), 24, (35, 35, 35), -1)

        warped, info = detect_and_warp(image)

        self.assertTrue(info["found"])
        self.assertEqual(warped.shape[:2], (342, 245))

    def test_accepts_high_similarity_reprints_with_same_identity(self):
        matcher = FastMatcher.__new__(FastMatcher)
        results = [
            {"score": 0.865, "name": "Charizard", "number": "4"},
            {"score": 0.863, "name": "Charizard", "number": "4_A"},
        ]

        self.assertFalse(matcher.confident(results))
        results[1]["number"] = "4"
        self.assertTrue(matcher.confident(results))


if __name__ == "__main__":
    unittest.main()
