# Production readiness (2026-09-06)

Status of the SeamCut deployment at https://seamcut.onrender.com. "Done" means implemented, tested locally and
verified on the live service. "Owner" means only the account owner can complete it (secrets, business facts).

## Done

| Area | What is in place |
|---|---|
| Transport | HSTS, nosniff, referrer policy, frame-ancestors none, permissions policy, no `x-powered-by` (`next.config.ts`). |
| Sessions | Opaque session ids in httpOnly, SameSite=Lax, Secure cookies; guest cookie same flags; scrypt password hashes. |
| CSRF | `src/proxy.ts` refuses state-changing `/api/*` requests whose `Sec-Fetch-Site`/`Origin` say cross-site (Stripe webhook exempt). |
| Abuse | Sliding-window limits: 10 auth attempts per IP per 10 min, 40 uploads and 30 generations per user per hour (`src/lib/server/ratelimit.ts`). Uploads over 500 MB are refused before buffering. |
| Jobs | Durable jobs table; on boot any job left `running` by a dead process is requeued (`Jobs.requeueStale`, `src/instrumentation.ts`). |
| Data safety | Daily SQLite backup to `<SEAM_DATA_DIR>/backups/` keeping 7 copies; guest projects older than 30 days and temp files older than a day are swept every 6 hours (`src/lib/server/maintenance.ts`). |
| Billing | Live Stripe products/prices/payment links, idempotent webhook crediting, automatic credit refund on failed generations, per-request pricing/account pages. |
| Legal | `/terms`, `/privacy`, `/refunds` linked from the footer; written as a plain-English starting point for counsel review. |
| SEO/share | `robots.txt`, `sitemap.xml`, Open Graph/Twitter card with `public/brand/og.png`, favicon. |
| Errors | Branded 404 and error boundaries. |
| CI | GitHub Actions: typecheck, tests, deploy-asset manifest check, production build on every push. |
| Providers | Blueprint no longer forces the local provider; adding FAL_KEY / RUNWAYML_API_SECRET / OPENAI_API_KEY turns on AI bridges and vision analysis. Retries set to 2. Bridge-capable models (both boundary frames): Higgsfield DoP Lite/Standard and Veo 3.1 Fast first→last via the Higgsfield developer API (`HIGGSFIELD_API_KEY_ID` + `HIGGSFIELD_API_KEY_SECRET`, src/core/providers/higgsfield.ts), and Kling 2.1 Pro via fal (about $0.45 per 5 s). Runway Gen-4 Turbo takes a first frame only and Gen-3 Alpha Turbo was sunset on 2026-07-30. ffmpeg remains the fallback when a provider fails or no key is set. Higgsfield per-model prices are estimates until the first live call; refine `costPerSecondUsd` from the API's estimate endpoint. |
| Free trial | Every new guest or account gets exactly 3 preview runs (`FREE_TRIAL_RUNS`); the fourth run returns 402 and the studio shows an inline paywall with the packs. New guest identities are capped at 10 per IP per day. |
| Flow test | `npm run e2e` (`scripts/e2e.ts`) drives the real product against any base URL: two uploads → boundary frames (last frame of clip A, first frame of clip B) → analysis → 3 runs → 4th refused → balance 0. CI runs it against a production build with the ffmpeg provider; run it against the live URL after every deploy. |

## Owner steps (secrets never go in Git or the blueprint)

Render → seamcut → Environment:

1. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (the latter is in local `.env.local`). Without them purchases complete on Stripe but are not credited.
2. `HIGGSFIELD_API_KEY_ID` + `HIGGSFIELD_API_KEY_SECRET` (create a key at the Higgsfield developer platform; API usage bills the Higgsfield account), `FAL_KEY` (top up fal first), `RUNWAYML_API_SECRET`, `OPENAI_API_KEY` to move from ffmpeg previews to AI bridges and real visual analysis. Paste the same Higgsfield pair into local `.env.local` and run `SEAM_FORCE_PROVIDER= npm run e2e` against a local production server to watch the first real AI runs.
3. `SEAM_SUPPORT_EMAIL` so the legal pages show a contact address; `SEAM_OPS_TOKEN` for `/ops`.
4. Custom domain: add it in Render → Settings → Custom Domains, then set `SEAM_PUBLIC_URL` and update the Stripe webhook URL and payment-link redirects to the new host.

## Known gaps

- The fal account is locked for exhausted balance (seen 2026-09-07), so Kling bridges fail until it is topped up; the router falls back to Runway Gen-3 Alpha Turbo and then ffmpeg.

- No password reset or email verification yet; both need an email provider (Resend or Postmark key). Until then, account recovery is manual.
- Single instance with a disk: deploys cause a short outage and the service cannot scale horizontally. Fine for launch; move SQLite to Postgres and files to object storage before scaling.
- Unit economics: a preview costs 1 credit ($0.18 on Starter) while an AI bridge costs roughly $0.25 to $0.50 at the providers. Revisit credit prices or the preview/final split before spending on ads.
- Rights: the speed-chain ad uses celebrity clips for reference only. Replace with licensed or recreated footage before paid placement.
- Backups live on the same disk as the database. For off-box copies, add a Render cron job that uploads `backups/` to object storage.

## Restore a backup

```bash
# In a Render shell on the service
ls /var/data/seam/backups
cp /var/data/seam/backups/seam-YYYYMMDD.sqlite /var/data/seam/seam.sqlite
```

Restart the service afterwards.
