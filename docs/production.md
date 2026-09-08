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
| CI | GitHub Actions: typecheck, tests, deploy-asset manifest check, production build and the end-to-end flow test on every push. Render deploys the branch automatically once those checks pass (`autoDeployTrigger: checksPass`). |
| Providers | Blueprint no longer forces the local provider; adding FAL_KEY / RUNWAYML_API_SECRET / OPENAI_API_KEY turns on AI bridges and vision analysis. Retries set to 2. Bridge-capable models (both boundary frames): Higgsfield DoP Lite/Standard and Veo 3.1 Fast first→last via the Higgsfield developer API (`HIGGSFIELD_API_KEY_ID` + `HIGGSFIELD_API_KEY_SECRET`, src/core/providers/higgsfield.ts), and Kling 2.1 Pro via fal (about $0.45 per 5 s). Runway Gen-4 Turbo takes a first frame only and Gen-3 Alpha Turbo was sunset on 2026-07-30. ffmpeg remains the fallback when a provider fails or no key is set. Higgsfield per-model prices are estimates until the first live call; refine `costPerSecondUsd` from the API's estimate endpoint. |
| Free trial | Every new guest or account gets exactly 3 preview runs (`FREE_TRIAL_RUNS`); the fourth run returns 402 and the studio shows an inline paywall with the packs. New guest identities are capped at 10 per IP per day. |
| Flow test | `npm run e2e` (`scripts/e2e.ts`) drives the real product against any base URL: two uploads → boundary frames (last frame of clip A, first frame of clip B) → analysis → 3 runs → 4th refused → balance 0. CI runs it against a production build with the ffmpeg provider; run it against the live URL after every deploy. |

## Owner steps: keys (about ten minutes)

Secrets are never typed into web forms by the assistant and never committed. Paste each one into the local `.env.local`
(same folder as `package.json`), then run one command that pushes them to Render and redeploys without printing any value:

```bash
npm run secrets:check   # shows which keys are set locally, sends nothing
npm run secrets:push    # upserts them on the Render service and starts a deploy
```

Keys and where they come from:

| Key | Where to create it | What it unlocks |
|---|---|---|
| `HIGGSFIELD_API_KEY_ID`, `HIGGSFIELD_API_KEY_SECRET` | set on Render 2026-09-07; the developer API has its own credit balance, which must be funded in the developer platform before bridges run | DoP and Veo 3.1 two-frame AI bridges |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → restricted key with Checkout Sessions write | Server-side checkout and webhook verification |
| `STRIPE_WEBHOOK_SECRET` | already in `.env.local` (created 2026-09-06 for the live endpoint) | Credits granted after payment |
| `FAL_KEY` | already in `.env.local`; top up fal.ai/dashboard/billing first | Kling 2.1 Pro bridges |
| `OPENAI_API_KEY` | already in `.env.local` | Vision analysis and judging |
| `RENDER_API_KEY` | Render → Account settings → API keys | Lets the push script write the values above |
| `SEAM_SUPPORT_EMAIL`, `SEAM_OPS_TOKEN` | your choice | Contact address on legal pages; `/ops` access |

After the deploy, `https://seamcut.onrender.com/api/runtime` lists the active providers, and
`E2E_BASE_URL=https://seamcut.onrender.com npm run e2e` proves three AI runs and the paywall on the live service.
A custom domain is added in Render → Settings → Custom Domains; then set `SEAM_PUBLIC_URL` and update the Stripe
webhook URL and payment-link redirects to the new host.

## Known gaps

- Provider balances (checked live 2026-09-07): the Higgsfield developer API answers `403 not_enough_credits` (its balance is separate from the web app that ran the trial), and fal is locked for exhausted balance. Until one of them is funded every run falls back to ffmpeg. After a billing failure a provider is parked for 10 minutes (`src/core/providers/cooldown.ts`) and `/api/runtime` lists it under `coolingDown`, so later runs skip straight to the fallback instead of re-uploading frames.

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

## Provider trial: Higgsfield Cinema Studio 3.0 (2026-09-07)

Tested through the Higgsfield MCP on the app's own sample pair (coffee cup last frame → ocean first frame), 4 s at 720p, 20 credits.
Result `data/ads-tmp/hf_trial.mp4`, sheet `data/ads-tmp/hf_judge.jpg`. Judgment on the WOW rubric (30/25/15/15/10/5):
seamless 27, wow 20, originality 11, motion 13, endpoint 9, visual 5 = 85. First frame reproduces the cup frame almost exactly,
last frame lands on the ocean frame, and the bridge is motivated: a ripple on the coffee, push into the surface, the rim
becomes the horizon at sunset, the sea widens. Weak spot: two mid frames read as a dark band with a bright edge. This is on par with
the MiniMax bridges used in the ad and better on endpoint accuracy, so Higgsfield is the preferred production bridge once the
developer API key is set; DoP/Veo are wired now, Cinema Studio can be added when its endpoint path is confirmed in the API.
