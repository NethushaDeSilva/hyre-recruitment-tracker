# Hyre

Recruitment and hiring tracker built for Altrium. React + Vite + Tailwind,
Firebase (Auth + Firestore + Storage), hosted on Cloudflare Pages with the AI
features running as Cloudflare Pages Functions (Workers AI, no API key).

See [`CLAUDE.md`](./CLAUDE.md) for the full product spec and build order.

## Setup

```
npm install
cp .env.example .env.local   # fill in Firebase config — see comments in the file
```

`.env.local` is git-ignored. **Vite only reads env vars at startup** — if you
edit `.env.local` while `npm run dev` is running, stop and restart it.

## Running locally — two processes, not one

`npm run dev` only starts Vite. Vite serves the React app, but it has no idea
`functions/` exists — it cannot run Cloudflare Pages Functions itself. Every
AI-backed feature (CV validation, CV parsing/extraction, "Filter with AI")
calls a same-origin `/api/*` path, and **that path only resolves locally if a
second process is also running.**

Run these in two separate terminals:

```
# Terminal 1 — the React app
npm run dev

# Terminal 2 — functions/ (Workers AI), served locally by wrangler
npm run dev:functions
```

- Terminal 1 serves the app at `http://localhost:5173`.
- Terminal 2 serves `functions/api/*` at `http://localhost:8788`, with a
  **real** Workers AI binding (calls go to Cloudflare's actual inference
  service, not a mock — see "AI cost while developing" below).
- `vite.config.js` proxies any `/api/*` request from port 5173 to port 8788,
  so the app works locally exactly as it does in production: same-origin
  `/api/*` calls, no CORS, no separate URL to configure.

**If you only run `npm run dev`**, every `/api/*` call resolves to Vite's own
dev server, which has no route for it — Vite's SPA fallback returns the
`index.html` shell instead of JSON, `res.json()` throws, and the app shows a
generic "we couldn't check your CV right now" error. This is not a bug in the
AI integration; it's a missing second process. If you see that error locally,
check Terminal 2 is running before anything else.

Both `npm run build` (a static bundle) and the deployed Cloudflare Pages site
serve the app and `functions/` from the same origin, so this split only
exists in local dev.

### Troubleshooting

- **"Infinite loop detected in this rule"** from `wrangler` on startup is a
  benign warning about `public/_redirects`' SPA-fallback rule — it doesn't
  affect anything Hyre uses (wrangler already handles the SPA fallback
  itself) and can be ignored.
- **A red bar at the top of the app** saying CV screening is unreachable
  means the app-load health check (`checkAiWorkersHealth()` in
  `src/lib/cv-extract.js`) couldn't reach one or both of the CV Worker
  endpoints. Check Terminal 2 is running, then check its console output —
  the real HTTP status and response body are logged there, not just "it
  failed."
- **Port already in use / requests hang forever with no response**: a stray
  `wrangler pages dev` process from an earlier run is still holding port
  8788 (Windows doesn't always clean these up when a terminal is closed).
  Two processes both bound to the same port causes requests to silently
  hang rather than fail — kill anything still listening on 8788 and start
  one fresh instance.

### AI cost while developing

`wrangler pages dev` auto-detects the `[ai]` binding in `wrangler.toml` and
defaults it to `remote: true` — local dev calls Cloudflare's real Workers AI
service and counts against the same Neurons quota as production. There is no
local/mock model. Don't run the full WS6 calibration or fixture suite
repeatedly on the free tier without checking usage first (see CLAUDE.md 5.5).

## Testing

```
npm test
```

Runs the vitest suite. Pure-function logic (the scoring engine, date-range
math, etc.) lives under `functions/_lib/filtration/` specifically so it can
be unit-tested with zero network calls and zero mocking.

## Deploying

```
npm run build
npx wrangler pages deploy dist --project-name=hyre-hiring
npx firebase deploy --only firestore:rules   # only if firestore.rules changed
```
