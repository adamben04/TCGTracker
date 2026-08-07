# Card Scanner Backend

Flask API backend for Pokemon Card Recognition using the pokemon-card-recognizer library.

## Setup

1. Create a Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

```bash
python app.py
```

The server will run on `http://localhost:5001` (override with `PORT`).

## API Endpoints

### Health Check
```
GET /health
```
Reports fast-matcher readiness and indexed-card count in `fast_matcher`.

### Scan Card
```
POST /api/scan-card
```

Accepts either:
- **File upload**: multipart/form-data with 'image' field
- **Base64**: JSON with 'image' field containing base64-encoded image

**Response:**
```json
{
  "success": true,
  "card": {
    "name": "Pikachu",
    "set": "Base Set",
    "number": "25",
    "confidence": 0.95,
    "id": "base1-25"
  }
}
```

### Available Sets
```
GET /api/available-sets
```

Returns list of all available Pokemon card sets.

## Security and deployment

- Local development permits cross-origin requests. In production (including
  Render), set `SCANNER_CORS_ORIGIN` to a comma-separated frontend allowlist;
  if it is unset, the service sends no CORS headers.
- Uploads are limited to 20 MB compressed, 12 million decoded pixels, and
  6000 pixels on either side. This protects the free-tier process from image
  decompression bombs.
- Submitted images are processed in memory (with an OCR-only temporary file
  deleted immediately) and are not included in grading results or retained by
  the scanner. The unauthenticated Python grading-history endpoint is disabled.

## Notes

- The backend uses the "master" set by default which includes all Pokemon cards
- OCR fallback uses a temporary image in `temp_uploads/`, which is deleted after processing
