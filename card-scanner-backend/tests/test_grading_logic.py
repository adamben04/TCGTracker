import base64
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import cv2


SCANNER_DIR = Path(__file__).resolve().parents[1]
if str(SCANNER_DIR) not in sys.path:
    sys.path.insert(0, str(SCANNER_DIR))

from grading_service import CategoryResult, combine_front_back_categories, encode_crop
import model_inference
from model_inference import _predict_score


class FrontBackGradingTests(unittest.TestCase):
    def test_lower_side_sets_each_category_score_and_evidence(self):
        front = {
            "centering": CategoryResult(9.5, "front centering"),
            "corners": CategoryResult(8.0, "front corner wear"),
        }
        back = {
            "centering": CategoryResult(7.0, "back off-center"),
            "corners": CategoryResult(9.0, "back corners"),
        }

        scores, combined = combine_front_back_categories(front, back)

        self.assertEqual(scores, [7.0, 8.0])
        self.assertEqual(combined["centering"]["score"], 7.0)
        self.assertIn("back off-center", combined["centering"]["details"])
        self.assertEqual(combined["corners"]["score"], 8.0)
        self.assertIn("front corner wear", combined["corners"]["details"])

    def test_regression_model_uses_neutral_evidence_weight(self):
        class Input:
            name = "image"

        class RegressionSession:
            @staticmethod
            def get_inputs():
                return [Input()]

            @staticmethod
            def run(_outputs, _inputs):
                return [np.array([[8.2]], dtype=np.float32)]

        image = np.zeros((224, 224, 3), dtype=np.uint8)
        score, confidence = _predict_score(RegressionSession(), image)

        self.assertEqual(score, 8.0)
        self.assertEqual(confidence, 0.5)

    def test_visual_evidence_is_bounded_for_api_delivery(self):
        image = np.random.default_rng(4).integers(0, 256, (1600, 1200, 3), dtype=np.uint8)
        encoded = encode_crop(image)
        decoded = base64.b64decode(encoded.split(",", 1)[1])
        rendered = cv2.imdecode(np.frombuffer(decoded, dtype=np.uint8), cv2.IMREAD_COLOR)

        self.assertLessEqual(max(rendered.shape[:2]), 720)
        self.assertLess(len(decoded), 750_000)

    def test_lfs_pointer_model_falls_back_to_heuristics(self):
        original_dir = model_inference.MODELS_DIR
        model_inference._SESSIONS.clear()
        with tempfile.TemporaryDirectory() as directory:
            model_dir = Path(directory)
            (model_dir / "corners.onnx").write_text(
                "version https://git-lfs.github.com/spec/v1\n", encoding="utf-8"
            )
            model_inference.MODELS_DIR = model_dir
            try:
                self.assertFalse(model_inference.models_available()["corners"])
                result = model_inference.predict_axis(
                    "corners", np.full((400, 280, 3), 127, dtype=np.uint8)
                )
                self.assertEqual(result["source"], "heuristic")
            finally:
                model_inference.MODELS_DIR = original_dir
                model_inference._SESSIONS.clear()


if __name__ == "__main__":
    unittest.main()
