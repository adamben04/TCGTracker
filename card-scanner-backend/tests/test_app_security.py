import base64
import os
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

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

    def test_collector_number_lookup_refuses_ambiguous_cross_set_matches(self):
        class Card:
            def __init__(self, card_id: str):
                self.id = card_id
                self.name = card_id
                self.number = "24"
                self.set = "Test"

        class Recognizer:
            class Classifier:
                class Reference:
                    cards = [Card("set-a-24"), Card("set-b-24")]

                reference = Reference()

            classifier = Classifier()

        self.assertIsNone(scanner_app._lookup_by_number("24/100", Recognizer()))

    def test_untrusted_forwarding_header_does_not_control_rate_limit_identity(self):
        with patch.dict(os.environ, {"CARD_SCANNER_PROXY_SECRET": ""}):
            with scanner_app.app.test_request_context(
                "/health",
                headers={"X-Forwarded-For": "203.0.113.10, 10.0.0.1"},
                environ_base={"REMOTE_ADDR": "198.51.100.25"},
            ):
                self.assertEqual(scanner_app._client_ip(), "198.51.100.25")

    def test_signed_proxy_header_preserves_originating_client_address(self):
        with patch.dict(os.environ, {"CARD_SCANNER_PROXY_SECRET": "shared-test-secret"}):
            with scanner_app.app.test_request_context(
                "/health",
                headers={
                    "X-Forwarded-For": "203.0.113.10",
                    "X-TCGTracker-Proxy-Key": "shared-test-secret",
                },
            ):
                self.assertEqual(scanner_app._client_ip(), "203.0.113.10")

    def test_rate_limit_client_map_is_bounded(self):
        original_limit = scanner_app._MAX_RATE_LIMIT_CLIENTS
        scanner_app._MAX_RATE_LIMIT_CLIENTS = 2
        scanner_app._RATE_LIMIT["hits"].clear()
        scanner_app._RATE_LIMIT["last_cleanup"] = 0.0
        try:
            self.assertFalse(scanner_app._rate_limited("198.51.100.1"))
            self.assertFalse(scanner_app._rate_limited("198.51.100.2"))
            self.assertTrue(scanner_app._rate_limited("198.51.100.3"))
            self.assertEqual(len(scanner_app._RATE_LIMIT["hits"]), 2)
        finally:
            scanner_app._RATE_LIMIT["hits"].clear()
            scanner_app._RATE_LIMIT["last_cleanup"] = 0.0
            scanner_app._MAX_RATE_LIMIT_CLIENTS = original_limit

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
