import base64
import os
import sys
import unittest
from io import BytesIO
from pathlib import Path

from flask import Flask
from PIL import Image


SCANNER_DIR = Path(__file__).resolve().parents[1]
if str(SCANNER_DIR) not in sys.path:
    sys.path.insert(0, str(SCANNER_DIR))

import app as scanner_app


def png_bytes(width: int, height: int) -> bytes:
    image = Image.new("RGB", (width, height), color="white")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class ScannerSecurityTests(unittest.TestCase):
    def _cors_app(self, environment: dict) -> Flask:
        app = Flask(__name__)

        @app.get("/probe")
        def probe():
            return {"ok": True}

        scanner_app._configure_cors(app, environment)
        return app

    def test_production_without_cors_origin_sends_no_cors_header(self):
        client = self._cors_app({"FLASK_ENV": "production"}).test_client()

        response = client.get("/probe", headers={"Origin": "https://untrusted.example"})

        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_explicit_cors_origin_is_allowlisted(self):
        client = self._cors_app(
            {"FLASK_ENV": "production", "SCANNER_CORS_ORIGIN": "https://app.example"}
        ).test_client()

        allowed = client.get("/probe", headers={"Origin": "https://app.example"})
        denied = client.get("/probe", headers={"Origin": "https://untrusted.example"})

        self.assertEqual(allowed.headers.get("Access-Control-Allow-Origin"), "https://app.example")
        self.assertIsNone(denied.headers.get("Access-Control-Allow-Origin"))

    def test_local_development_remains_permissive(self):
        client = self._cors_app({}).test_client()

        response = client.get("/probe", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173")

    def test_decoded_pixel_limit_rejects_small_compressed_bomb(self):
        original_limit = scanner_app.MAX_IMAGE_PIXELS
        scanner_app.MAX_IMAGE_PIXELS = 4
        try:
            with self.assertRaises(scanner_app.ImageValidationError) as context:
                scanner_app._decode_image_bytes(png_bytes(3, 2))
        finally:
            scanner_app.MAX_IMAGE_PIXELS = original_limit

        self.assertEqual(context.exception.status_code, 413)

    def test_standard_twelve_megapixel_phone_photo_is_accepted(self):
        image = scanner_app._decode_image_bytes(png_bytes(4_032, 3_024))

        self.assertEqual(image.size, (4_032, 3_024))

    def test_scan_rejects_base64_image_over_decoded_limit(self):
        original_limit = scanner_app.MAX_IMAGE_PIXELS
        scanner_app.MAX_IMAGE_PIXELS = 4
        try:
            encoded = base64.b64encode(png_bytes(3, 2)).decode("ascii")
            response = scanner_app.app.test_client().post("/api/scan-card", json={"image": encoded})
        finally:
            scanner_app.MAX_IMAGE_PIXELS = original_limit

        self.assertEqual(response.status_code, 413)
        self.assertIn("decoded-pixel limit", response.get_json()["error"])

    def test_grading_preview_is_bounded_and_not_written_to_disk(self):
        image = Image.new("RGB", (2_000, 1_000), color="white")

        preview = scanner_app._encode_preview(image)

        self.assertTrue(preview.startswith("data:image/jpeg;base64,"))
        decoded = base64.b64decode(preview.split(",", 1)[1])
        with Image.open(BytesIO(decoded)) as rendered:
            self.assertLessEqual(max(rendered.size), 1_600)

    def test_unauthenticated_grading_history_route_is_not_exposed(self):
        response = scanner_app.app.test_client().get("/api/grading-history/any-card")

        self.assertEqual(response.status_code, 404)

    def test_health_reports_unready_fast_matcher(self):
        original_matcher = scanner_app._fast_matcher
        original_ready = scanner_app._fast_ready

        class UnreadyMatcher:
            loaded = False
            size = 0

        scanner_app._fast_matcher = UnreadyMatcher()
        scanner_app._fast_ready = True
        try:
            response = scanner_app.app.test_client().get("/health")
        finally:
            scanner_app._fast_matcher = original_matcher
            scanner_app._fast_ready = original_ready

        health = response.get_json()
        self.assertFalse(health["features"]["fast_matcher_ready"])
        self.assertEqual(health["fast_matcher"]["cards_indexed"], 0)


if __name__ == "__main__":
    unittest.main()
