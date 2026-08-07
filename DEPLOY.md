# Cloud deployment guide — TCGTracker

This guide sets up the entire app in the cloud for free, accessible from your
phone with nothing running on your PC. You do NOT need a credit card (Render
free, Cloudflare Pages, Supabase all have gratis tiers with email-only signup).

Current production frontend: <https://tcgtracker-9oc.pages.dev/>

The architecture:

| Service | Host | Free tier | Purpose |
|---|---|---|---|
| **Frontend SPA** | Cloudflare Pages | 100k requests/day, no cold start | Static React/Vite build (`dist/`) |
| **Node API + SQLite** | Render free web service | 512 MB RAM, sleeps after 15 min idle | All business logic + data |
| **Card scanner (DINOv2 ML)** | Render free web service | 512 MB RAM, sleeps after 15 min idle | `/api/scan-card` heaviest work |
| **DB backup/restore** | Supabase Storage | 1 GB storage | SQLite gzip-chunked backup so user data survives Render redeploys |

The frontend talks to two separate Render services in production:
- `${VITE_API_URL}` → Render (Node API)
- `${VITE_CARD_SCANNER_API_URL}` → Render (Flask scanner)

In dev both are still proxied through Vite (see `vite.config.ts`).

> **750-hour budget warning:** Render free tier gives 750 hours/month
> **total** across all free services. With two services, you need both to
> sleep most of the time. If both run 24/7 (~744 h each = ~1488 h total)
> you'll exceed the budget in ~15 days. Sleep mode is your friend — requests
> only cost hours while the container is awake. With typical phone usage
> (a few scans/day) you'll stay well under. If you hit the limit, Render
> pauses the oldest-spent service first.

---

## Prerequisites

You need a working local clone with the heavy scanner assets present
(`card-scanner-backend/dinov2_vits14_224.onnx`, `*.onnx.data`,
`fast_index.npz`, `fast_index_meta.json`, `models/*.onnx`). Confirm these
files exist locally before deploying the scanner service.

Also confirm you can push to a GitHub repo for this project (the user the
project belongs to). Forking is fine.

---

## Step-by-step deploy (follow in order)

### A. Supabase — 5 minutes

1. Sign up at <https://supabase.com> (free, email only) and create a new
   project. Pick any region; note the **Project URL** (looks like
   `https://abcdefgh.supabase.co`).
2. In the project: **Storage → Create a new bucket**, name it
   `tcgtracker-data`, set it **Private** (no public access). Confirm.
3. **Project Settings → API** → copy the **`service_role` secret key**
   (NOT the `anon` key — the service_role key can read/write Storage
   server-side, which is what the Node backend needs).
4. Save these three values:
   - `SUPABASE_URL` = `https://<your-project>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<service_role secret>`
   - `SUPABASE_BUCKET` = `tcgtracker-data`

#### One-time: upload the current local DB to Supabase

From your PC (only done once — this seeds the cloud backup that the Render
container will restore on every cold boot):

```powershell
cd backend
# create a backend/.env with:
# SUPABASE_URL=https://<your-project>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
# SUPABASE_BUCKET=tcgtracker-data
# CLOUD_SYNC_ENABLED=true
# JWT_SECRET=<any 32+ hex string, e.g. run: openssl rand -hex 32>
# then run:
npm run upload-db-to-cloud
```

This creates a consistent SQLite snapshot, verifies it, gzips it, and uploads
immutable chunks (each under 50 MB). `latest/manifest.json` is a small,
checksummed pointer to the immutable backup manifest.

The backup code is already wired — `backend/src/services/cloudBackupService.ts`
does the chunking and single-flight scheduling. The Node boot hook
(`backend/src/index.ts → restoreDatabaseOnBootIfMissing`) validates any existing
database before deciding whether to restore. Restore downloads to a temporary
file, verifies checksums and `PRAGMA integrity_check`, then atomically swaps it
before SQLite opens. Periodic backups run every 15 minutes after boot.

---

### B. Render — sign up + create both services — 15 minutes

1. Sign up at <https://render.com> (free, email only).
2. Preferred: **New → Blueprint** and select this repository. The checked-in
   `render.yaml` creates both services with the correct Dockerfiles, ports,
   health checks, database path, and CORS origins. Fill every `sync: false`
   secret before the first deploy.
3. If you prefer manual services, continue with B1/B2 below.
4. Push the project to your GitHub repo if not already there:
   ```powershell
   # If not on GitHub yet:
   git push origin main
   ```

#### B1. Node API service

5. Render dashboard → **New → Web Service** → connect your repo
   (`adamben04/TCGTracker`):
   - **Name**: `tcgtracker-api` (or anything; this becomes the URL)
   - **Root Directory**: `backend`
   - **Runtime**: Docker
   - **Dockerfile Path**: `backend/Dockerfile` (relative to repo root)
   - **Instance Type**: **Free**
6. **Environment** → set ALL of these before deploying:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` |
   | `HOST` | `0.0.0.0` |
   | `JWT_SECRET` | `<use the same value from your backend/.env>` |
   | `ADMIN_BOOTSTRAP_EMAIL` | `<email of the account that should administer backups>` |
   | `CORS_ORIGIN` | `https://tcgtracker-9oc.pages.dev` |
   | `AUTH_BYPASS_ENABLED` | `false` |
   | `CLOUD_SYNC_ENABLED` | `true` |
   | `SUPABASE_URL` | `https://<your-project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service_role secret>` |
   | `SUPABASE_BUCKET` | `tcgtracker-data` |
   | `DATABASE_PATH` | `/app/data/tcg-prices.db` |

   Set `DATABASE_PATH` explicitly: the application default is relative and is
   not the persistent Render data directory. Do NOT set any `VITE_*` variables
   on the API — those are frontend-only.

7. Click **Deploy**. Watch logs: on first cold start you'll see
   `Cloud sync enabled and local DB missing — restoring from Supabase…`
   then `Cloud restore succeeded` (~30–90 s). Then
   `TCGTracker Backend server running on http://0.0.0.0:3001`.
8. Note the URL: `https://tcgtracker-api.onrender.com`.

After registering the administrator account, set `ADMIN_BOOTSTRAP_EMAIL` to its
exact email and restart the API. Startup grants the immutable database role.
For local maintenance, the equivalent command is
`npm run promote-admin -- <username-or-email>` inside `backend`.

#### B2. Scanner service

9. Render dashboard → **New → Web Service** → connect the same repo:
   - **Name**: `tcgtracker-scanner` (or anything)
   - **Root Directory**: `card-scanner-backend`
   - **Runtime**: Docker
   - **Dockerfile Path**: `card-scanner-backend/Dockerfile.hf` (relative to
     repo root — the fast-path-only Dockerfile that skips the 1.7 GB
     `pokemon-card-recognizer` package)
   - **Instance Type**: **Free**
10. **Environment** → set ALL of these before deploying:

   | Key | Value |
   |---|---|
   | `PORT` | `7860` |
   | `SCANNER_CORS_ORIGIN` | `https://tcgtracker-9oc.pages.dev` |

11. Click **Deploy**. Watch logs: first build compiles deps + copies the
   ~110 MB ML assets; expect ~3–5 min, then the container boots, does the
   one-time DINOv2 ONNX warmup (~1 s), and listens on port 7860.
12. Note the URL: `https://tcgtracker-scanner.onrender.com`.
13. Open `https://tcgtracker-scanner.onrender.com/health` — you should get
    JSON with `"status": "ok"` and `"fast_ready": true`.

---

### C. Cloudflare Pages (frontend SPA) — 10 minutes

1. Sign up at <https://dash.cloudflare.com/sign-up> (free, email only).
2. **Workers & Pages → Create application → Pages → Connect to Git**.
   Authorize Cloudflare to access your GitHub repo, select it.
3. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (the repo root, not `backend`)
4. **Environment variables** (set BEFORE the first build so they bake into
   the static bundle):

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://tcgtracker-api.onrender.com` |
   | `VITE_CARD_SCANNER_API_URL` | `https://tcgtracker-scanner.onrender.com` |
   | `VITE_ENABLE_AUTH` | `true` |

   Do NOT set `VITE_BACKEND_URL` (legacy alias) or any `localhost` value.

5. Save and Deploy. Watch the build: it runs `npm install && npm run build`
   and serves `dist/`. Cloudflare picks up `dist/_redirects` for SPA fallback
   routing automatically.
6. The current production URL is <https://tcgtracker-9oc.pages.dev/>.

---

### D. Wire CORS on both Render services — 5 minutes

Use the exact production origin on both services:

1. **Node API** → Environment → edit `CORS_ORIGIN` → set it to
   `https://tcgtracker-9oc.pages.dev` → Save → Manual Deploy → Restart.
2. **Scanner** → Environment → edit `SCANNER_CORS_ORIGIN` → set it to
   `https://tcgtracker-9oc.pages.dev` → Save → Manual Deploy → Restart.

The browser uses an HttpOnly auth cookie. Because Cloudflare Pages and Render
are cross-site, production login requires all three settings together:

- frontend requests use `credentials: include`;
- API responses use `Access-Control-Allow-Credentials: true` for the exact
  `CORS_ORIGIN` (never `*`);
- the API cookie is `SameSite=None; Secure`.

A future custom domain with same-site `app.example.com` and `api.example.com`
is preferable, but the configuration above is supported.

---

### E. Verify everything works

```powershell
# 1. Node API health
curl https://tcgtracker-api.onrender.com/api/health
# → {"status":"healthy","timestamp":"…","version":"1.0.0","environment":"production"}

# 2. Scanner health
curl https://tcgtracker-scanner.onrender.com/health
# → {"status":"ok","fast_ready":true,...}

# 3. Scanner scan (use a real card photo)
curl -F "image=@some_card_photo.jpg;type=image/jpeg" `
  https://tcgtracker-scanner.onrender.com/api/scan-card
# → {"success":true,"card":{"id":"swsh4-25","name":"Charizard",...},"debug":{"fast":true,...}}
```

Open `https://tcgtracker-9oc.pages.dev` on your phone. Log in (or create an
account). Try the Pack shop, scanner, and vault.

---

## F. End-to-end phone smoke test

1. Phone → open `https://tcgtracker-9oc.pages.dev`.
2. Login or register.
3. **Packs**: should load without "tcg is not defined". Tap a pack → see
   open animation. If you see "Something went wrong", check the browser
   console — likely a CORS issue missing the pages.dev origin from Render's
   `CORS_ORIGIN` (Node API) or `SCANNER_CORS_ORIGIN` (scanner service).
4. **Scanner**: snap a card photo with the card filling the frame. Expect
   `debug.fast === true`, `debug.timing.total_ms` ~150–250 ms, and the card
   named. First scan after scanner cold-start may take 30–60 s — wait for
   the cron-ping to keep it warm, or open the scanner `/health` URL once in
   a browser to wake it.
5. **Vault/Portfolio**: add a card. Restart the Render service manually
   (Render → Manual Deploy → Restart). Refresh the SPA — your entry should
   still be there (proves Supabase restore-on-boot worked). The log should
   show `Cloud restore succeeded`.

---

## G. What to do if something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend: "Failed to fetch" / CORS error in console | `CORS_ORIGIN` on Render missing the pages.dev origin, or `SCANNER_CORS_ORIGIN` on scanner missing it | Add it (comma-separated if several) to both Render services, redeploy/restart |
| Scanner returns `ocr_available: false` + "Card not recognised" on a real photo | The DINOv2 fast matcher wasn't confident (gap < 0.02) and OCR is disabled in this build. | Re-take the photo with the card filling the frame, better lighting. ~5% of scans (art-similar cards like base-set Charizard w/ huge borders) may need a clearer shot |
| Scanner cold start takes 30–60 s | Render free tier sleeps after 15 min | Cron-job.org pinging `/health` every 10 min keeps it warm. Same for the Node API. |
| Render API takes 30–60s on first request after idle | Render free tier sleeps after 15 min | Same fix — cron pinger to `/api/health`. (We didn't add one by default; carve your own with cron-job.org) |
| All vault data looks fresh / accounts gone after Render restart | Supabase restore-on-boot did not complete | Check logs for integrity/checksum failures. Verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, and `DATABASE_PATH=/app/data/tcg-prices.db`. The bucket must contain a valid `latest/manifest.json` pointer. |
| Login succeeds but the next request is signed out | Cross-site cookie or CORS mismatch | Confirm the exact Pages origin on `CORS_ORIGIN`, HTTPS, `credentials: include`, and a `SameSite=None; Secure` cookie in browser devtools. |
| Scanner refuses browser requests in production | Scanner origin is unset or wrong | Production scanner CORS fails closed. Set `SCANNER_CORS_ORIGIN=https://tcgtracker-9oc.pages.dev` and restart. |
| `card.id` is null on scans | DINOv2 matched but the card row in `meta` has no id for that set (some pre-release / promo sets) | Run `python card-scanner-backend/fast_match.py --extend` locally, re-deploy the scanner service on Render (push updated assets to the repo branch, Render auto-deploys) |
| Render deploy fails: "Invalid environment variables: JWT_SECRET must be at least 32 characters" | You forgot to set `JWT_SECRET` | `openssl rand -hex 32`, set it on Render, redeploy |
| Render deploy fails: "Dockerfile not found" | Dockerfile Path is wrong | For Node API: `backend/Dockerfile`. For scanner: `card-scanner-backend/Dockerfile.hf`. Both relative to repo root. |

---

## H. Local dev (unchanged)

```powershell
# Terminal 1 — Node API on :3001
cd backend ; npm run dev

# Terminal 2 — Scanner on :5001 (full features: fast path + OCR fallback)
cd card-scanner-backend ; .\venv\Scripts\python.exe app.py

# Terminal 3 — Vite dev server on :5173 with /api/* proxied
npm run dev:full
```

Nothing about local dev changed — the new cloud wiring is conditional on env
vars (`CLOUD_SYNC_ENABLED`, `SCANNER_CORS_ORIGIN`, `VITE_API_URL`,
`VITE_CARD_SCANNER_API_URL`). When unset, the app behaves exactly as before.

Quality gates before pushing:

```powershell
npm run lint
npm run type-check
npm run test:run
npm run build
npx playwright test

cd backend
npm run lint
npm run test:run
npm run build

cd ..\card-scanner-backend
python -m unittest discover -s tests -v
```

---

## Quick reference: all env vars

| Service | Variable | Value | Where set |
|---|---|---|---|
| Cloudflare Pages | `VITE_API_URL` | `https://tcgtracker-api.onrender.com` | Pages → Env vars (before first build) |
| Cloudflare Pages | `VITE_CARD_SCANNER_API_URL` | `https://tcgtracker-scanner.onrender.com` | Pages → Env vars (before first build) |
| Cloudflare Pages | `VITE_ENABLE_AUTH` | `true` | Pages → Env vars (before first build) |
| Render (Node API) | `NODE_ENV` | `production` | Render → Environment |
| Render (Node API) | `PORT` | `3001` | Render → Environment |
| Render (Node API) | `HOST` | `0.0.0.0` | Render → Environment |
| Render (Node API) | `JWT_SECRET` | `<32+ hex>` | Render → Environment |
| Render (Node API) | `ADMIN_BOOTSTRAP_EMAIL` | `<administrator account email>` | Render → Environment |
| Render (Node API) | `CORS_ORIGIN` | `https://tcgtracker-9oc.pages.dev` | Render → Environment |
| Render (Node API) | `DATABASE_PATH` | `/app/data/tcg-prices.db` | Render → Environment |
| Render (Node API) | `AUTH_BYPASS_ENABLED` | `false` | Render → Environment |
| Render (Node API) | `CLOUD_SYNC_ENABLED` | `true` | Render → Environment |
| Render (Node API) | `SUPABASE_URL` | `https://<your-project>.supabase.co` | Render → Environment |
| Render (Node API) | `SUPABASE_SERVICE_ROLE_KEY` | `<service_role secret>` | Render → Environment |
| Render (Node API) | `SUPABASE_BUCKET` | `tcgtracker-data` | Render → Environment |
| Render (scanner) | `PORT` | `7860` | Render → Environment |
| Render (scanner) | `SCANNER_CORS_ORIGIN` | `https://tcgtracker-9oc.pages.dev` | Render → Environment |
| Supabase | — | — | Just create the `tcgtracker-data` bucket (Private) |
