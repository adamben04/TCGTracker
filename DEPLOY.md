# Cloud deployment guide — TCGTracker

This guide sets up the entire app in the cloud for free, accessible from your
phone with nothing running on your PC. You do NOT need a credit card (Render
free, Cloudflare Pages, Supabase all have gratis tiers with email-only signup).

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

## A. Supabase (Storage for DB backup/restore) — 5 minutes

1. Sign up at <https://supabase.com> (free, email only) and create a new
   project. Pick any region; note the **Project URL** (looks like
   `https://abcdefgh.supabase.co`).
2. In the project: **Storage → Create a new bucket**, name it
   `tcgtracker-data`, set it **Private** (no public access). Confirm.
3. **Project Settings → API** → copy the **`service_role` secret key**
   (NOT the `anon` key — the service_role key can read/write Storage
   server-side, which is what the Node backend needs).
4. Save these three values for the Render env in step C:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role secret
   - `SUPABASE_BUCKET` = `tcgtracker-data`

### One-time: upload the current local DB to Supabase

From your PC (only done once — this seeds the cloud backup that the Render
container will restore on every cold boot):

```powershell
cd backend
# create a backend/.env with:
# SUPABASE_URL=https://abcdefgh.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
# SUPABASE_BUCKET=tcgtracker-data
# CLOUD_SYNC_ENABLED=true
# then run:
npm run upload-db-to-cloud
```

This gzips `backend/tcg-prices.db` (~140 MB → ~30 MB) and uploads it in
chunks (each under 50 MB) to `latest/manifest.json` in your bucket.

The backup code is already wired — `backend/src/services/cloudBackupService.ts`
does the chunking. The Node boot hook I added
(`backend/src/index.ts -> restoreDatabaseOnBootIfMissing`) pulls this file
back on every Render cold start, before SQLite opens it. Periodic backups run
every 15 minutes after boot.

---

## B. Render (card scanner — DINOv2 ML) — 10 minutes

The scanner is a Python Flask app. Render's free tier runs Docker images.
We deploy a **second Render web service** from the same repo, root directory
`card-scanner-backend`.

1. Render dashboard → **New → Web Service** → connect your GitHub repo:
   - **Root Directory**: `card-scanner-backend`
   - **Runtime**: Docker
   - **Dockerfile Path**: `Dockerfile.hf` (the fast-path-only Dockerfile that
     skips the 1.7 GB `pokemon-card-recognizer` package)
   - **Instance Type**: **Free**
   - **Service Name**: `tcgtracker-scanner` (or anything; this becomes the URL)
2. **Environment** → set these:

   | Key | Value | Why |
   |---|---|---|
   | `PORT` | `7860` | Flask listens here (matches Dockerfile EXPOSE + gunicorn bind) |
   | `SCANNER_CORS_ORIGIN` | `https://<your-project>.pages.dev` (set after step D; comma-separate multiple) | Restricts CORS to your SPA |

3. Trigger a manual deploy (Render → Manual Deploy → Deploy latest commit).
4. Watch logs: first build compiles deps + copies the ~110 MB ML assets;
   expect ~3–5 min, then the container boots, does the one-time DINOv2 ONNX
   warmup (~1 s), and listens on port 7860.
5. Note the Render URL: `https://<scanner-service-name>.onrender.com`.
6. Open `https://…/health` — you should get JSON with `"status": "ok"` and
   `"fast_ready": true`.
7. **Set `SCANNER_CORS_ORIGIN`** after you get the Cloudflare Pages URL in
   step D. Render → Environment → edit `SCANNER_CORS_ORIGIN` → save →
   Manual Deploy → Restart.

> **Why not HF Spaces?** Docker Spaces now require a paid HF Pro plan.
> Render's free tier works the same — same Docker, same image, zero cost.

### Verify the scanner in isolation

```powershell
curl -F "image=@some_card_photo.jpg;type=image/jpeg" `
  https://<scanner-service-name>.onrender.com/api/scan-card
```

Expect a JSON with `"card": {"id": "swsh4-25", "name": "Charizard", …}` and
`"debug": {"fast": true, "ocr_available": false, ...}`. The
`ocr_available: false` field is the fast-path-only marker — the DINOv2 fast
matcher handled the scan; OCR fallback was skipped.

---

## C. Render (Node API + SQLite) — 10 minutes

1. Sign up at <https://render.com> (free, email only).
2. Push the project to a **GitHub** repo (Render connects to GitHub).
   ```powershell
   # If the project isn't on GitHub yet:
   gh repo create tcgtracker --private --source=. --remote=origin --push
   # (or use git remote add origin https://github.com/<you>/tcgtracker.git; git push -u origin main)
   ```
3. Render dashboard → **New → Web Service** → connect your repo:
   - **Root Directory**: `backend` (very important — Render runs the build
     from here)
   - **Runtime**: Docker
   - **Dockerfile Path**: leave as default (it'll find `backend/Dockerfile`)
   - **Instance Type**: **Free**
   - Wait for the first deploy. It `npm ci`s, `npm run build`s the TS, and
     starts `node dist/index.js`.
4. **Environment** → set these variables (use the values from A):

   | Key | Value | Why |
   |---|---|---|
   | `NODE_ENV` | `production` | |
   | `PORT` | `3001` | (Render also injects its own `PORT`, but Dockerfile bakes this) |
   | `HOST` | `0.0.0.0` | Render needs the server bound to all interfaces |
   | `DATABASE_PATH` | `/app/data/tcg-prices.db` | default in `backend/src/config/env.ts`; can omit |
   | `JWT_SECRET` | `<32+ hex>` | `openssl rand -hex 32` |
   | `CORS_ORIGIN` | `https://<your-project>.pages.dev` (comma-separated if you also use a custom domain) | Must include the SPA origin(s) |
   | `AUTH_BYPASS_ENABLED` | `false` | keep auth on in prod |
   | `CLOUD_SYNC_ENABLED` | `true` | enables Supabase backup/restore |
   | `SUPABASE_URL` | `https://abcdefgh.supabase.co` | from step A |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service_role secret>` | from step A |
   | `SUPABASE_BUCKET` | `tcgtracker-data` | from step A |
   | `SENTRY_ENVIRONMENT` | `production` | (optional, if you use Sentry) |
   | `VITE_*` | — | VITE_* are frontend-only; Render does NOT need them |

5. Trigger a manual deploy (Render → Manual Deploy → Deploy latest commit).
6. Watch logs: on first cold start you'll see
   `Cloud sync enabled and local DB missing — restoring from Supabase…` and
   then `Cloud restore succeeded` (~30–90 s depending on chunk download).
   Then `TCGTracker Backend server running on http://0.0.0.0:3001`.
7. Note the Render URL: `https://<service-name>.onrender.com`.

### Render free-tier caveats you should know

- **Sleeps after 15 min idle.** First request after sleep takes ~30–60 s to
  spin up. The Supabase restore only runs when the container is recreated
  (a deploy or restart after sleep sometimes reuses the disk — but assume
  ephemeral). Periodic backup every 15 min and on SIGTERM means user writes
  from the last 0–15 min before sleep are NOT lost. Worst case: lose up to
  15 min of writes between the last backup and an abrupt termination.
- **750 free web-service-hours/month total across all your free services.**
  With two services (Node API + scanner), both sleeping most of the time,
  you'll stay well under. If you push the budget, Render pauses the
  oldest-spent service first — you'll notice slower scanner scans or API
  calls until you manually restart it.
- First deploy may take 5+ minutes to build + boot. Subsequent cold starts
  ~30–60 s.

### Verify

```powershell
curl https://<service-name>.onrender.com/api/health
# {"status":"healthy","timestamp":"…","version":"1.0.0","environment":"production"}
```

---

## D. Cloudflare Pages (frontend SPA) — 10 minutes

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
   | `VITE_API_URL` | `https://<node-service-name>.onrender.com` (from C) |
   | `VITE_CARD_SCANNER_API_URL` | `https://<scanner-service-name>.onrender.com` (from B) |
   | `VITE_ENABLE_AUTH` | `true` |
   | `VITE_SENTRY_ENVIRONMENT` | `production` (optional) |

   Do NOT set these — they break prod routing:
   - `VITE_BACKEND_URL` (legacy alias)
   - any `localhost` value

5. Save and Deploy. Watch the build: it runs `npm install && npm run build`
   and serves `dist/`. Cloudflare picks up `dist/_redirects` (added in this
   repo) for SPA fallback routing automatically.
6. After deploy you get a `https://<project>.pages.dev` URL (and a
   `<project>.gitlab-pages…` you can ignore). **Set this URL** as the
   `CORS_ORIGIN` on both Render services (Node API in step C **and**
   scanner in step B). Then redeploy/restart both services so they pick
   up the new allowed origin.
7. (Optional) custom domain — Cloudflare Pages → Custom domains → add one
   (free, auto-managed TLS). Update `CORS_ORIGIN` and `SCANNER_CORS_ORIGIN`
   to include it.

### Verify

Open the `https://<project>.pages.dev` URL on your phone. Log in (or create
an account, since you set `AUTH_BYPASS_ENABLED=false`). Try the Pack shop
(it now works — bug fixed). Try the scanner: tap a card photo, you should
see the card identified in <1 s during steady state.

---

## E. End-to-end phone smoke test

1. Phone → open `https://<project>.pages.dev`.
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

## F. What to do if something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend: "Failed to fetch" / CORS error in console | `CORS_ORIGIN` on Render missing the pages.dev origin, or `SCANNER_CORS_ORIGIN` on scanner missing it | Add it (comma-separated if several) to both Render services, redeploy/restart |
| Scanner returns `ocr_available: false` + "Card not recognised" on a real photo | The DINOv2 fast matcher wasn't confident (gap < 0.02) and OCR is disabled in this build. | Re-take the photo with the card filling the frame, better lighting. ~5% of scans (art-similar cards like base-set Charizard w/ huge borders) may need a clearer shot |
| Scanner cold start takes 30–60 s | Render free tier sleeps after 15 min | Cron-job.org pinging `/health` every 10 min keeps it warm. Same for the Node API. |
| Render API takes 30–60s on first request after idle | Render free tier sleeps after 15 min | Same fix — cron pinger to `/api/health`. (We didn't add one by default; carve your own with cron-job.org) |
| All vault data looks fresh / accounts gone after Render restart | Supabase restore-on-boot didn't fire | Check logs: `Cloud restore skipped — local DB already present` means a populated DB file survived (good). If `Cloud restore failed`, verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` are set in Render env and that the bucket has `latest/manifest.json` |
| `card.id` is null on scans | DINOv2 matched but the card row in `meta` has no id for that set (some pre-release / promo sets) | Run `python card-scanner-backend/fast_match.py --extend` locally, re-deploy the scanner service on Render (push updated assets to the repo branch, Render auto-deploys) |
| Render deploy fails: "Invalid environment variables: JWT_SECRET must be at least 32 characters" | You forgot to set `JWT_SECRET` | `openssl rand -hex 32`, set it on Render, redeploy |

---

## G. Local dev (unchanged)

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

---

## Quick reference: env vars across services

| Service | Variable | Where set |
|---|---|---|
| Cloudflare Pages | `VITE_API_URL`, `VITE_CARD_SCANNER_API_URL`, `VITE_ENABLE_AUTH`, `VITE_SENTRY_ENVIRONMENT` | Pages → Settings → Environment variables (before first build) |
| Render (Node API) | `NODE_ENV`, `PORT`, `HOST`, `JWT_SECRET`, `CORS_ORIGIN`, `CLOUD_SYNC_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `AUTH_BYPASS_ENABLED` | Render → Environment |
| Render (scanner) | `PORT`, `SCANNER_CORS_ORIGIN` | Render → Environment |
| Supabase | none — just the bucket created in the dashboard | n/a |
