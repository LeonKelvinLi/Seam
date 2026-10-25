# Production readiness (checked 2026-10-25)

## Current verification

This section supersedes the dated implementation notes below. Configuration is not proof of a successful
payment, email delivery, backup, or AI generation.

| Area | Current evidence and remaining work |
|---|---|
| Deployment | `https://clipmelt.com` and `https://seamcut.onrender.com` serve the same Render service. The Next.js 16.3.8 security PR was merged as `0924fec`; the live health endpoint reports that revision. |
| Security follow-up | A fresh npm audit found newer Next.js, sharp, source-map-js and Zod advisories. The follow-up lockfile resolves Next.js 16.4.3, sharp 0.35.5, source-map-js 1.2.2 and Zod 4.6.7; `npm audit` reports zero vulnerabilities. Verify the deployed revision after release. |
| Generation | Higgsfield DoP first/last-frame models lead. One rendered take per click; provider failures can fail over. A rendered take below the quality bar can be delivered with a note. OpenAI is optional; do not infer that every output passed a vision judge. |
| Live AI proof | A fresh coffee/ocean run on deployed `0924fec` completed in 279 seconds, using Higgsfield DoP Turbo in one attempt; the judge scored 87/100. The full edit and bridge downloaded, the signed-out [share page](https://clipmelt.com/t/xmyqb4hr) loaded, and a second run returned 402 with zero credits. The contact sheet shows a steam/haze bridge; the judge notes an overly long cream-colour hold, so this is a passing functional proof rather than a general quality guarantee. |
| Pricing | Preview: 2 credits; final: 6. Starter: $9/12 credits (6 previews); Pro: $29/44 (22); Studio: $99/170 (85). Legacy checkout receipts retain their purchased allocation. `src/lib/server/billing.ts` is the source of truth. |
| Google | Production Google sign-in completed through the browser and returned to `/account` successfully on October 25. |
| Email | A reset request to the owner account returned 200; the actual “Reset your Clipmelt password” message arrived in the Gmail inbox at 4:53 PM Pacific on October 25. No password was changed. |
| Stripe | Payment Links and webhook signing secret are configured; server-created Checkout Sessions are disabled because `STRIPE_SECRET_KEY` is absent. Dashboard access is blocked on owner password recovery. Refund/delayed-payment event subscriptions and a real purchase/refund remain unverified. |
| Provider funds | fal's key-scoped billing endpoint reports $4.22882, below the configured $15 threshold. Funding requires an approved top-up. This does not measure Higgsfield funds. |
| Backups | No `SEAM_BACKUP_BUCKET` is set. The runtime image now includes the backup upload/verify CLI; connect private S3/R2 storage, upload a snapshot, and verify it into a new isolated directory before treating this as complete. |
| Health | Basic database/FFmpeg/disk checks pass. Dependency readiness returns 503 for low fal funds and unconfigured off-site backup. Keep those checks enabled until their causes are resolved. |

The backup CLI uses a separate read-only SQLite connection, so it does not run application startup recovery
or change active job states. Use it in Render Shell, from `/app`:

```sh
node --import tsx scripts/backup-offsite.ts --help
node --import tsx scripts/backup-offsite.ts upload
node --import tsx scripts/backup-offsite.ts verify ACTUAL-MANIFEST-KEY /tmp/seam-restore-NEW
```

The verify command checks downloaded database/media checksums, SQLite integrity and referenced-media coverage;
it never replaces live data. A successful local fixture test is not evidence of a production restore.

## Historical implementation and verification notes

The sections below describe work at their stated dates. Their prices, routing, retry counts and account
setup status may be superseded by the current verification above and the running service.

## Higgsfield submission safety — 2026-09-17

Generation POSTs are sent once. Network/response loss, HTTP 408/5xx, or a missing request ID stop automatic model
fallback because the provider may already be rendering. Status GETs still retry transient failures with bounded
backoff. Accepted request IDs and correlation IDs are saved before polling; polling/output failures preserve them
for reconciliation instead of buying another take. Confirmed provider failures remain eligible for fallback.

Submission intent is persisted before the paid POST. After a restart, an interrupted Higgsfield attempt stops and
returns the user's credits rather than starting over; this is conservative recovery, not automatic retrieval of the
original video. Already-finished generations are not rendered/refunded again when a stale runner job is replayed.
Transport fault tests and pipeline tests cover lost responses, read recovery, receipt persistence, fallback suppression,
restart handling and replay protection. These tests use mocked provider responses and do not spend generation credits.

Status of the Clipmelt deployment at https://seamcut.onrender.com. "Done" means implemented, tested locally and
verified on the live service unless a row states a narrower result. Account configuration, delivered email,
real payment settlement, and monitoring alerts require their own evidence; implemented code alone does not prove them.

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
| Providers | Blueprint no longer forces the local provider; adding FAL_KEY / RUNWAYML_API_SECRET / OPENAI_API_KEY turns on AI bridges and vision analysis. Retries set to 3, and the last one is routed to the ablest model for the transition class whatever its tier or price (`best` in `routeModels`), because a run that ends with nothing is worse than a dearer take that works: on 2026-09-12 a live Phone Screen Portal was rejected at 18 on DoP Lite, its Push Through retry at 52 on DoP Standard, and the visitor got a refund instead of a transition. Bridge-capable models (both boundary frames): Higgsfield DoP Lite/Standard and MiniMax Hailuo-02 Standard/Pro via the Higgsfield developer API (Hailuo-02 prices are estimates) (`HIGGSFIELD_API_KEY_ID` + `HIGGSFIELD_API_KEY_SECRET`, src/core/providers/higgsfield.ts), and Kling 2.1 Pro via fal (about $0.45 per 5 s). Veo 3.1 Fast/full first→last are in the API but answer this account with 404 model_not_found (probed 2026-09-10), so they sit in `HIGGSFIELD_NOT_ENABLED` and are never routed; before that, every final render spent its first attempt on a two-second Veo failure. `npx tsx scripts/probe-higgsfield.ts` shows which models the key can use at no cost. Runway Gen-4 Turbo takes a first frame only and Gen-3 Alpha Turbo was sunset on 2026-07-30. ffmpeg is a development and CI path only: with a bridge model configured, a run that no AI bridge passes fails and refunds instead of delivering a crossfade (`SEAM_ALLOW_PROCEDURAL=1` re-enables it). Only seamless recipes are offered; effect moves and plain cuts stay in the catalog but are never recommended. Higgsfield per-model prices are estimates until the first live call; refine `costPerSecondUsd` from the API's estimate endpoint. |
| Free trial | Every person gets exactly 1 preview run (`FREE_TRIAL_RUNS`), shared between their guest session and the account they sign up for (`Users.adopt` keeps the smaller balance for accounts that never paid); the second run returns 402 and the studio shows an inline paywall with the packs. New guest identities are capped at 10 per IP per day. |
| Quality bar | Preview takes must score 70 again (final 72), raised from 65 on 2026-09-10 once no crossfade fallback remained. In that day's proof runs through the real pipeline, a 66 take (Hailuo-02, paper plane to airliner) melted into a dissolve with two planes on screen, and an 82 take (DoP Lite, TV portal) was one clean push through the screen. Hailuo-02 stays wired but ranks last until it proves itself. `selectPassingCandidate` now judges a take against its own mode's bar: before, preview takes scoring 65 to 71 were discarded for missing the final bar. Every AI take also goes through a pixel check for cross-dissolves and hard cuts (`src/core/quality/seamless.ts`): a take with either fails whatever the judge scored, and its stored scores are capped so the learned model ranking records the failure. The judge had passed a DoP Lite Object Morph at 73 that held the paper plane still for 3.5 s and then cross-dissolved to the airliner; the check flags that take and none of the 28 reviewed library and example bridges. `npx tsx scripts/check-seams.ts <videos>` audits any clip. |
| Effect fit | Every offered effect is graded against the uploaded clips (`src/core/opportunities/fit.ts`): Great fit, Could work, or Poor fit with the missing footage in plain words. Lanes never recommend a poor fit, the library disables it, and `createGeneration` refuses it (`POOR_FIT`) and any retired effect before any credit is charged. |
| Flow test | `npm run e2e` (`scripts/e2e.ts`) drives the real product against any base URL: two uploads → boundary frames (last frame of clip A, first frame of clip B) → analysis → a 16 MB upload → 3 runs → 4th refused → balance 0. The large upload is there because `src/proxy.ts` used to run on `/api/upload`: Next buffers bodies that pass through a proxy and cuts them at 10 MB, so on 2026-09-11 every real phone clip failed with "Failed to parse body as FormData" while the small samples passed. The proxy now skips that route, which runs the cross-site check itself. CI runs it against a production build with the ffmpeg provider; run it against the live URL after every deploy. |

## Configure the service

Keep secrets out of Git, logs, and chat. Store authorized configuration privately in the local `.env.local`
(same folder as `package.json`), then use the script to push supported values to Render and redeploy without printing them:

```bash
npm run secrets:check   # shows which keys are set locally, sends nothing
npm run secrets:push    # upserts them on the Render service and starts a deploy
```

Keys and where they come from:

| Key | Where to create it | What it unlocks |
|---|---|---|
| `HIGGSFIELD_API_KEY_ID`, `HIGGSFIELD_API_KEY_SECRET` | set on Render 2026-09-07; the developer API has its own credit balance, which must be funded in the developer platform before bridges run | DoP and Hailuo-02 two-frame AI bridges (Veo 3.1 once the account is enabled for it) |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → restricted key with Checkout Sessions write | Server-side Checkout Sessions; Payment Links and local webhook signature verification do not require this key |
| `STRIPE_WEBHOOK_SECRET` | already in `.env.local` (created 2026-09-06 for the live endpoint) | Credits granted after payment |
| `FAL_KEY` | already in `.env.local`; verify current balance at fal.ai/dashboard/billing | Kling 2.1 Pro bridges |
| `OPENAI_API_KEY` | already in `.env.local` | Vision analysis and judging |
| `RENDER_API_KEY` | Render → Account settings → API keys | Lets the push script write the values above |
| `RESEND_API_KEY`, `SEAM_MAIL_FROM` | Resend API key and sender on a domain verified in that Resend account | Delivered password-reset and account-confirmation email |
| `SEAM_COMPANY_NAME`, `SEAM_COMPANY_ADDRESS`, `SEAM_SUPPORT_EMAIL` | Verified operator details and a monitored support mailbox | Contact details on legal pages. Transactional mail sets Reply-To **only when the support address is on the sending domain**: a business From with a free-mail Reply-To costs about 2.5 SpamAssassin points (FREEMAIL_FORGED_REPLYTO) and lands account mail in Spam. A mail-tester run scored 6.5/10 with a Gmail Reply-To and 9.3/10 without it, 2026-09-10 |
| `SEAM_PUBLIC_URL` | The service's public HTTPS origin | Correct links in transactional mail and shared projects |
| `SEAM_OPS_TOKEN` | A private random token | `/ops` and `/api/metrics` access using an Authorization header |

The script upserts only nonempty allowlisted values; missing local values leave existing Render settings unchanged.
It supports all mail and business fields above. It does not provision a sender domain, create a mailbox, or verify DNS.
Legal pages read contact settings at request time. After changing settings and restarting the service, verify the rendered pages.

After the deploy, `https://seamcut.onrender.com/api/runtime` lists the active providers, and
`E2E_BASE_URL=https://seamcut.onrender.com npm run e2e` exercises three generations and the paywall on the live service.
Inspect each generation's provider and attempt log to distinguish accepted AI output from the procedural fallback.
A custom domain is added in Render → Settings → Custom Domains; then set `SEAM_PUBLIC_URL` and update the Stripe
webhook URL and payment-link redirects to the new host.

## Sign in with Google, email and live payments (2026-09-22)

**Google sign-in** is built (`src/lib/server/google.ts`, `/api/auth/google`, `/api/auth/google/callback`). It uses the
OpenID Connect code flow with PKCE, `state` and `nonce`, and only accepts Google-verified emails. A Google identity
signs into the account already linked to it, otherwise the account with the same email (now linked), otherwise a new
account with the trial credits. If that same-email account never confirmed its address, its password and sessions are
removed when it is linked. The "Continue with Google" button appears only when both keys are set. Covered by
`tests/google-auth.test.ts` and a local run against a stubbed token endpoint.

Owner setup (Google Cloud Console, the owner's account):
1. OAuth consent screen: External, app name Clipmelt, support email, home page `https://seamcut.onrender.com`,
   privacy `/privacy`, terms `/terms`. Scopes: `openid`, `email`, `profile` (non-sensitive, so no Google review is
   needed). Set the publishing status to **In production**; in Testing mode only listed test users can sign in.
2. Credentials → Create OAuth client ID → Web application. Authorized redirect URIs:
   `https://seamcut.onrender.com/api/auth/google/callback` and, for local work, `http://localhost:3000/api/auth/google/callback`.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Render → Environment (or in `.env.local`, then
   `node scripts/push-secrets.mjs --apply` with `RENDER_API_KEY`). The login page shows the button after the next deploy.

**Email sign-in** (password, confirmation and reset mail) is unchanged. Delivery on Render needs `RESEND_API_KEY` and
`SEAM_MAIL_FROM` there. Both are set locally, but nobody has confirmed they are set on Render. `next` redirects after
sign-in now accept only same-site paths.

**Payments**, checked in live mode with the Stripe CLI on 2026-09-22:
- The three Payment Links are active: $9, $29 and $89 USD, quantity fixed at 1, no promotion codes, no automatic tax.
  Each redirects to `/account?paid=1&pack=…`. Production sells through them (the webhook secret is set).
- The live webhook endpoint `https://seamcut.onrender.com/api/stripe/webhook` is enabled but only subscribed to
  `checkout.session.completed`. Add `charge.refunded` (otherwise refunds keep the credits) and
  `checkout.session.async_payment_succeeded`.
- `STRIPE_SECRET_KEY` is not on Render, so the app uses the Payment Links. Adding it switches purchases to
  server-created Checkout Sessions, with no other change needed.
- Final proof needs one real purchase: buy Starter ($9) with a real card, confirm 30 credits arrive, refund it in
  Stripe, and confirm the credits are taken back.

## Known gaps

- Provider balances are external account state. Higgsfield was funded and produced accepted AI output on 2026-09-08 (see verification below); its current balance and auto top-up status require an account check. fal's last documented billing check found an exhausted balance. After a billing failure a provider is parked for 10 minutes (`src/core/providers/cooldown.ts`) and `/api/runtime` lists it under `coolingDown`. An empty cooldown list does not prove a provider has funds.

- Password reset and email verification are implemented. Delivery needs `RESEND_API_KEY` and `SEAM_MAIL_FROM`, a verified sender domain, and an actual delivery check. Without configuration, no mail is sent. Only local development logs message content; production logs omit recipients and recovery tokens.
- Single instance with a disk: deploys cause a short outage and the service cannot scale horizontally. Fine for launch; move SQLite to Postgres and files to object storage before scaling.
- Current pricing is 2 credits per preview and 6 per final: Starter $9/30 credits, Pro $29/120, Studio $89/400. Provider-cost estimates and acceptance rates still need monitoring; the daily budget tracks recorded generation fees, not provider account balance, and concurrent/in-flight requests can pass the budget before their costs are recorded.
- Rights: the speed-chain ad uses celebrity clips for reference only. Replace with licensed or recreated footage before paid placement.
- Backups live on the same disk as the database. Off-box backup is not configured. Upload completed SQLite backups from the running service to a private object-store bucket, then verify a restore from that bucket. A separate Render cron service cannot read this service's persistent disk. The current backups contain the database only; uploaded footage, generated files, and exports need a separate backup plan if those must be recoverable.
- The public legal pages still need verified company address and a working contact email. The setup follow-up corrects Terms to use the billing credit constants, lists Higgsfield in Privacy, and makes contact values available at request time. Company address and support email still require the owner's supplied public details.
- Render uses `/api/health` with workspace failure notifications enabled, verified 2026-09-09. An independent uptime monitor and an observed alert-delivery test still need completion.

## Restore a backup

SQLite runs in WAL mode. Do not overwrite `seam.sqlite` while the web service, worker, maintenance timer,
or another database connection is active. A local restore drill does not prove a production or off-site backup is recoverable.

1. Retrieve a completed snapshot into an isolated directory and verify its checksum against the recorded backup
   manifest. Run the following from the application directory, which has `better-sqlite3` installed. Replace the
   dated filename with the snapshot selected for recovery; do not point it at the live database.

```bash
umask 077
seam_restore_work=$(mktemp -d /var/data/seam/restore-check.XXXXXX)
cp /var/data/seam/backups/seam-YYYYMMDD.sqlite "$seam_restore_work/candidate.sqlite"
export SEAM_RESTORE_CANDIDATE="$seam_restore_work/candidate.sqlite"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const candidate = new Database(process.env.SEAM_RESTORE_CANDIDATE, { readonly: true, fileMustExist: true });
assert.deepEqual(candidate.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
assert.deepEqual(candidate.pragma('foreign_key_check'), []);
for (const table of ['users', 'projects', 'purchases', 'generations', 'assets', 'exports']) {
  console.log(table, candidate.prepare(`SELECT COUNT(*) AS rows FROM ${table}`).get());
}
console.log('pending jobs', candidate.prepare("SELECT status, COUNT(*) AS rows FROM jobs WHERE status IN ('queued','running') GROUP BY status").all());
candidate.close();
NODE
```

2. Compare those counts with the backup's recorded recovery point. Before changing production, take a **fresh
   rollback snapshot** of the current live database with SQLite's online backup API, using a new destination:

```bash
export SEAM_ROLLBACK_SNAPSHOT="$seam_restore_work/current-before-restore.sqlite"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const current = new Database('/var/data/seam/seam.sqlite', { readonly: true, fileMustExist: true });
await current.backup(process.env.SEAM_ROLLBACK_SNAPSHOT);
current.close();
const rollback = new Database(process.env.SEAM_ROLLBACK_SNAPSHOT, { readonly: true, fileMustExist: true });
assert.deepEqual(rollback.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
rollback.close();
NODE
```

3. Establish a maintenance window that keeps disk access available while stopping all application and worker
   processes. Stop incoming writes, wait for or explicitly reconcile in-flight provider jobs, and prevent automatic
   process restarts. Verify that all SQLite connections are closed. A quiet queue alone is not sufficient. If the
   host cannot provide this maintenance access, stop here rather than performing a live file replacement.
4. With writers stopped, preserve the current `seam.sqlite` and any `seam.sqlite-wal` / `seam.sqlite-shm` files
   together in a separate rollback directory, retaining their ownership and permissions. Keep the fresh online
   snapshot too. Do not discard a WAL file before preserving the stopped database state.
5. Stage the validated candidate on the same filesystem, owned by the service's actual UID/GID with restrictive
   permissions (normally `0600`); its parent directory must be writable by that service account so SQLite can create
   its journals. Record and verify the existing service ownership instead of assuming a username. Move the old
   database and journals aside, then atomically rename the staged candidate to `/var/data/seam/seam.sqlite`.
   No stale WAL or SHM file may remain beside the newly restored database. Restore required footage, frames and
   exports to the paths referenced in that snapshot; database-only backups do not contain those files.
6. Before starting the app, reconcile the restored `queued` and `running` jobs with provider state. Opening the
   app requeues `running` jobs, so an unchecked restart can repeat paid generation work. Start one service
   instance, then check `/api/health`, sign-in, purchase/credit records, project visibility, and actual transition-only
   and full-video media downloads. Record the recovery point and any missing data or files. Keep rollback artifacts
   until these checks pass; applying a rollback also requires stopped writers and the same WAL-safe procedure.

## Provider trial: Higgsfield Cinema Studio 3.0 (2026-09-07)

Tested through the Higgsfield MCP on the app's own sample pair (coffee cup last frame → ocean first frame), 4 s at 720p, 20 credits.
Result `data/ads-tmp/hf_trial.mp4`, sheet `data/ads-tmp/hf_judge.jpg`. Judgment on the WOW rubric (30/25/15/15/10/5):
seamless 27, wow 20, originality 11, motion 13, endpoint 9, visual 5 = 85. First frame reproduces the cup frame almost exactly,
last frame lands on the ocean frame, and the bridge is motivated: a ripple on the coffee, push into the surface, the rim
becomes the horizon at sunset, the sea widens. Weak spot: two mid frames read as a dark band with a bright edge. This is on par with
the MiniMax bridges used in the ad and better on endpoint accuracy, so Higgsfield is the preferred production bridge once the
developer API key is set; DoP/Veo are wired now, Cinema Studio can be added when its endpoint path is confirmed in the API.

## Live AI verification (2026-09-08)

After the Higgsfield developer balance was funded (160 credits), the flow test on the live service produced real AI bridges:
run 1 Higgsfield DoP Lite accepted at quality 73 on the first attempt; run 2 two DoP attempts rejected at 63 and 66, then
the ffmpeg fallback; run 3 rejected at 64, then accepted at 79. Boundary frames, the three-run trial and the 402 paywall held.

What this showed and what changed:

- A remapped bridge ends at exactly its duration, and a frame request at that instant made ffmpeg exit non-zero before the
  fallback offsets could run; every AI attempt died there while procedural bridges carried one extra frame. Fixed in
  `extractFrameAt` (each candidate is tried, the last one seeks from the end) with a regression test.
- A rejected model is now excluded for the rest of that generation so the retry goes to the next-best bridge model.
- Cost and latency profile: DoP Lite takes 190 to 410 s per call and about 4.5 Higgsfield credits (about $0.28); the OpenAI
  judge accepts roughly half of its outputs at the default threshold of 70. Lower `SEAM_QUALITY_THRESHOLD` to 65 for more
  AI results per credit, or keep 70 for stricter seams. Balance after the test: 133 credits.
- `/api/runtime` now reports `version` (deployed commit), `forcedProvider`, `coolingDown` and `bridgeModels`; the
  generation view carries `attemptLog` with per-attempt model, status, quality, duration and error, which the flow test prints.

## Launch batch (2026-09-09)

Everything from the readiness review that code can fix, verified locally and pushed for deploy:

| Item | What changed |
|---|---|
| Payments credit without the API key | Webhook signature checks are local HMAC work, so the handler now verifies with the webhook secret alone. Payment Link purchases credit accounts as soon as this deploys. `STRIPE_SECRET_KEY` is still needed for server-side Checkout Sessions. |
| Pricing that clears provider cost | A preview costs 2 credits, a final render 6. Packs since 2026-09-24: Starter $9 = 12 credits (6 previews, $1.50 each), Pro $29 = 44 (22, $1.32), Studio $99 = 170 (85, $1.16). Measured cost of an accepted preview is about $0.40-0.60, so each pack keeps roughly 50-65% gross margin at full use. Previews run one model at a time (`SEAM_PARALLEL_ATTEMPTS=1`); the parallel double-render paid for two models on every run. Checkouts opened on the pre-repricing links are still credited at their old size (`LEGACY_PACKS` in `src/lib/server/billing.ts`). Free trial is 1 run (2 credits). Free runs stop at `SEAM_DAILY_PROVIDER_BUDGET_USD`; customers who have paid run on until `SEAM_DAILY_PAID_BUDGET_USD`. |
| Wait time | Preview threshold 65 (final 72) so fewer good bridges are rejected; a rejected model is not retried in the same generation; `SEAM_PARALLEL_ATTEMPTS=2` runs two bridge models at once on the first round (roughly halves the wait, doubles provider cost; default 1). The studio says plainly that an AI bridge takes 3 to 5 minutes, that leaving the page is fine, and fires a browser notification when it finishes in the background. |
| Judge calibration | A procedural dissolve is capped at 80 so a real bridge that clears the bar always wins. Human calibration of the rubric is still worth doing. |
| Spend cap | `SEAM_DAILY_PROVIDER_BUDGET_USD` (default 25): once the day's generation fees pass it, runs use ffmpeg until midnight UTC. `/api/runtime` shows `budget`. |
| Password reset and email confirmation | `/forgot` → one-hour link → `/reset` (signs out other devices); sign-up sends a 7-day confirmation link to `/verify`; `/api/auth/verify/resend` for signed-in users. Mail goes through Resend when `RESEND_API_KEY` and `SEAM_MAIL_FROM` are set; otherwise the link is logged only in local development; production does not log recovery tokens. |
| Health for monitors | `/api/health` checks the database, ffmpeg and free disk (503 under 500 MB), and reports queue depth, parked providers and budget. Point an uptime monitor (UptimeRobot, Better Stack, Checkly) at it with a 5-minute interval and email or Slack alerts. Render's own check now uses `/api/health` (saved and verified live on 2026-09-09). |
| Legal details | `SEAM_COMPANY_ADDRESS` and `SEAM_SUPPORT_EMAIL` render on the legal pages. |

## Account and launch verification still required

1. Complete one authorized real Starter purchase, confirm the matching Stripe payment succeeded and exactly 30 credits land on the account, then verify an authorized refund. `scripts/webhook-selftest.mjs` posts a synthetic signed event and grants real application credits; it tests the handler only, does not prove a paid Stripe transaction, and must not be reported as payment settlement.
2. Add `RESEND_API_KEY` and `SEAM_MAIL_FROM` (a verified sender domain) on Render so reset and confirmation mail is delivered.
3. Set `SEAM_SUPPORT_EMAIL` and `SEAM_COMPANY_ADDRESS`; have counsel read `/terms`, `/privacy`, `/refunds`.
4. Create an external uptime monitor on `https://seamcut.onrender.com/api/health`, select an authorized alert destination, and verify an alert is delivered. The endpoint was healthy at 2026-09-09 23:24 UTC on commit `24d0f0f`: database and ffmpeg passed, 9,442 MB free, no queued jobs. This snapshot does not establish ongoing monitoring.
5. Check the Higgsfield developer balance and configure any authorized auto top-up in the provider account. `/api/health` reports application spend budget and parked providers; it does not expose provider balances.
6. Replace the celebrity clips in the ad before paid placement; add a custom domain when ready.
7. Configure off-box backups and complete a restore check before calling backup recovery verified.

## Account setup follow-up (2026-09-09)

- Render health-check update deployed successfully (`dep-daguneeq1p3s73918ir0`); the app was healthy with queue 0. Blueprint now preserves `/api/health`.
- Stripe live account: charges and payouts enabled, no currently due requirements; existing SeamCut Payment Links have 30/120/400 credit metadata. No paid SeamCut Checkout Session was found in the latest 100 sessions. A real purchase remains unverified.
- Resend dashboard: `beastypages.com` and `leonbuilds.org` are verified. No SeamCut sender/domain choice or production key was configured in this follow-up.
- Higgsfield Cloud developer dashboard: 111 available credits, 49 used, 21 API calls. Auto-refill configuration remains unverified and needs an explicit spending limit.
- Render has daily whole-disk snapshots dated September 6, 7 and 8. These are separate from the app's SQLite backups and do not establish tested database recovery or an independent object-store backup. Render documents snapshot limits at https://render.com/docs/disks#disk-snapshots.
- External uptime setup requires account access; the UptimeRobot sign-in page is prepared. SSH backup export also needs an SSH key added to Render; no new access was created.

## Preview routing and fan-out (2026-09-16)

Problem measured on the live service that morning: one preview took 12.7 minutes because the router ranked Kling 2.1 Pro
(tagged final-tier) last, ran DoP Lite (rejected at 66, 210 s) and DoP Standard (rejected at 52, 387 s) before Kling passed at 84 in 102 s.

Change (commit 2e0aa79):

- The router now ranks previews by expected time-to-accept and expected cost-to-accept: per model, acceptance rate, mean judge
  score and mean wall time come from every judged attempt in the database (`Attempts.modelStats()`), smoothed with a prior of
  0.6 and a pseudo-count of 3 until a model has data. Preview score = quality 0.4 + speed 0.4 + cost 0.2; finals stay quality-first.
- Seeds updated from production: Kling 2.1 Pro ~110 s and usable for previews; DoP Lite 210 s; DoP Standard 390 s.
- `SEAM_PARALLEL_ATTEMPTS=2`: the first round runs the top two models together and ends at the first pass; the slower sibling
  keeps rendering and is logged when it lands (its cost is booked either way).
- `/api/runtime` shows `previewRoute` with the profile behind each choice. Live after deploy: Kling first (expected 157 s, $0.64),
  DoP Lite second (acceptance 0.45 over 21 judged attempts, expected 519 s, $0.22), Hailuo-02 next.

Verification: one live run passed with Kling at quality 93 in 112 s of model time. The run's wall time was 4.5 minutes only
because the instance restarted mid-run (the push changed `render.yaml`, so the blueprint sync and the checks-pass auto-deploy
each deployed once); the job was requeued and re-ran from the start, which is the designed recovery. Steady-state wait for a
preview is now about 2 to 2.5 minutes. Cost per preview round is now Kling $0.45 plus DoP Lite $0.10 plus judging, against
$0.45 to $0.60 of revenue per preview, so the fan-out is roughly break-even on Starter and loses a little on Studio; drop back to
`SEAM_PARALLEL_ATTEMPTS=1` if margin matters more than the wait, since Kling alone now leads.

Operational note: a push that touches `render.yaml` deploys twice. Put blueprint changes in their own commit, or mark the
code commit `[skip render]`, and never push while a customer generation is running.

The double deploy is confirmed in Render's deploy list: 2e0aa79 deployed from `blueprint_sync` at 21:12 UTC and again from
`new_commit` at 21:16 UTC.

### Late fan-out sibling reverted ready previews (found and fixed the same evening)

A fan-out sibling that finished after its round ended still wrote the generation's stage, and every stage write sets
`status: "running"`. A ready preview therefore went back to "Checking the result" about a minute later, stayed there,
and its share page returned 404. It happened on every fan-out run: the e2e test stopped watching at the first "ready".

- Fix: attempts report stages only while their round is open (`live` in `src/core/pipeline/generate-job.ts`).
  `tests/fan-out-late-sibling.test.ts` runs the real job with a held second model and fails without the fix.
- Repair: on boot, `Generations.restoreFinished()` marks ready any generation that holds a result and whose job is done.
- Gate: `scripts/e2e.ts` now waits for every attempt to settle, then fails unless the run still reads ready and its share
  page loads for a signed-out visitor. `E2E_SAVE_DIR` keeps the video, frames and guest session of a paid run.

### OpenAI answered 429 on production from 21:14 UTC

Every OpenAI call on the live service from 21:14 UTC on 09-16 to 04:27 UTC on 09-17 (clip analysis and the judge) returned HTTP 429, so those runs used
the heuristic analyzer and judge. The "quality 93" results above are heuristic scores, not vision-judge scores. The morning
run at 19:25 UTC (Kling 84) was judged by OpenAI. The same key answered normally from a local machine at about 04:35 UTC on 09-17, with
both a text request and a production-sized vision request. Log lines now include OpenAI's error code
(`rate_limit_exceeded` or `insufficient_quota`) so the next failure names its cause. While the judge falls back, the model
acceptance rates in `previewRoute` are built on heuristic passes.

## Transition quality overhaul (2026-09-16, night)

Leon's verdict on the live results: not good enough, it has to look smooth and professional. The live bridges came from
Kling 2.1 Pro with the recipe template prompt, sped up 4.5x into 1.1 s. Higgsfield's Cinema Studio, which made the library
previews, is not on Higgsfield's developer API (every guessed path answers `model_not_found`; the catalogue is behind the
console login).

### Model comparison

One take per model on the live pair's boundary frames, with one hand-written shot, native length, audio off. The outputs
are in `data/live-results/2026-09-16-model-eval/`.

| Model (fal) | Take | Time | Cost | Verdict |
|---|---|---|---|---|
| Wan 3.0 Prime | 5 s 720p | 101 s | $0.25 | best: the drop's ripple carries onto the sea |
| MiniMax H3 Max | 5 s 768p | 13 s | $0.13 | clean: the coffee opens into the sea inside the rim |
| Kling O3 Pro | 4 s 1080p | 106 s | $0.56 | clean morph |
| Veo 3.1 | 4 s | 48 s | $1.60 | half-and-half wipe, ghosted rim |
| Veo 3.1 Fast | 4 s | 38 s | $0.60 | ghosted frame |
| PixVerse V6 Transition | 5 s | 54 s | cheap | lovely macro, then a hard cut |
| Flux 3 first/last frame | 5 s | 70 s | $0.43 | blends through black |
| Seedance 2.5 | 4 s | 288 s | ~$1.90 | blends through black |
| Kling v3 Pro | 4 s 1080p | 159 s | $0.56 | double exposure |
| Kling 2.1 Pro, same shot | 5 s 1080p | 109 s | $0.49 | the sea floods the kitchen; ignores the move |

The pixel seam gate passed all ten, including the double exposure and the hard cut.

### What changed

- Routing (`src/core/providers/fal.ts`): H3 Max leads previews, then Wan 3.0 Prime, then Kling O3 Pro. Finals rank the
  same three on quality. Kling 2.1, DoP and Hailuo-02 remain as fallbacks. A second first-round model now starts only
  when the lead is expected to take over 60 s; racing Wan behind H3 would book $0.25 a preview for nothing.
- Director (`src/core/prompt/director.ts`, gpt-5.6-sol): one vision call per generation and style writes the shot the
  model renders, naming the real objects and the one motivated change. The recipe template is the fallback. The
  instructions describe the form of a shot and never a sample scene.
- Pacing (`config.output.maxBridgeSpeedup`, 2.5): a 5 s render plays in 2 s, the length of the site's example bridges,
  instead of being squeezed into the recipe's 0.8 to 1.4 s.
- Framing: a render within 8% of the project's shape is cropped to fill the frame. The blur-fit padded H3 Max's
  1344x768 with thin dark side bars.
- Judge (`src/core/quality/openai-judge.ts`): gpt-5.6-sol, nine sampled frames instead of five, and an explicit rule
  that blends, double exposures, half-and-half wipes and cuts fail while portals pass. On eleven reviewed bridges,
  clean morphs scored 90 to 95, a ghosted rim 78, and blends 43 to 49. gpt-5.4-mini passed three blends and a cut
  above 90, and gpt-6-astra failed clean morphs. Pass marks are now 80 for previews and 82 for finals (`render.yaml`).
  gpt-5.4-mini answers if sol fails. When neither answers, the take is refused, the generation stops, and the credits
  are refunded. The pixel heuristic scored 93 on a take the vision judge failed at 45.
- The negative prompt keeps short phrases only; the pair's risk sentences go to the director.

### Local proof through the full pipeline (real models, no forced route)

| Pair | Style | Model | Judge | Bridge | Spend |
|---|---|---|---|---|---|
| coffee to ocean | Liquid Transform | H3 Max, 21 s | 87 | 2.07 s | $0.125 + $0.011 director + $0.027 judge |
| door to beach | Push Through | H3 Max, 20 s | 91 | 2.07 s | $0.125 + $0.011 + $0.026 |

A preview now costs about $0.16 in fees against $0.45 to $0.60 of revenue, down from about $0.55 with the Kling and
DoP fan-out. The outputs are in `data/live-results/2026-09-16-local-proof/`.

## Launch follow-through — 2026-09-17

### Refund receipts

Stripe must deliver `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
`charge.refunded` to `/api/stripe/webhook`. Payment status must be `paid`; only recognized USD pack prices grant
credits. Purchase recording and granting are one SQLite transaction. Each PaymentIntent links to its purchase;
charge refund totals are monotonic so retries and out-of-order events cannot debit twice. Partial refunds revoke
proportional whole credits (rounded down); a full refund revokes all purchased credits. Already-spent credits
produce a negative balance that blocks further generation until replenished. No customer money is refunded by
this webhook; it reacts to Stripe refunds. For old receipts without a PaymentIntent mapping, replay the original
checkout event first; it links the receipt without granting again. A real purchase/refund still needs separate evidence.

### Balance and readiness

The documented fal account billing API is `GET https://api.fal.ai/v1/account/billing?expand=credits`
(https://fal.ai/docs/platform-apis/v1/account/billing). It requires ADMIN scope. The existing generation key returned
403 on September 17; set a private `FAL_ADMIN_KEY` on Render. Do not replace the generation key merely to monitor
billing. Status is cached for 60 seconds with a 5-second network timeout; missing/inaccessible/malformed data is
`unknown`, never a fabricated zero or stale success. The default low-balance threshold is $5.

Render continues checking `/api/health` for database/FFmpeg/disk failures. An external monitor should check
`/api/health?readiness=1`, which additionally returns 503 for low/unknown fal funds and absent/stale off-site backups.
This avoids provider credit depletion causing Render to restart the service. Exact balance is available only in
protected `/ops`; public readiness exposes a state. Existing ops access uses `Authorization: Bearer <SEAM_OPS_TOKEN>`.
Never put that token in a query string or public deployment file.

### Off-site snapshots and verification

Set `SEAM_BACKUP_BUCKET`, `SEAM_BACKUP_REGION` (`auto` for R2), optionally `SEAM_BACKUP_ENDPOINT` (HTTPS),
`SEAM_BACKUP_PREFIX`, and restricted `SEAM_BACKUP_ACCESS_KEY_ID` / `SEAM_BACKUP_SECRET_ACCESS_KEY` on Render.
Use a private encrypted bucket with Head/Get/Put permissions on this prefix. No public ACL is added. The existing
AWS SDK dependency was preserved and integrated. Without a bucket, uploads remain disabled.

Maintenance uploads from the service owning the disk, once after startup and every six hours. Each snapshot uses
SQLite's online backup API, validates integrity, then reads all asset, frame, export, and delivered-result media
references from the frozen database. Missing media causes failure instead of publishing an incomplete snapshot.
Files are stored under SHA-256 object keys; the dated manifest is uploaded last, and a success receipt is written
only after that. Referenced media must be inside uploads/frames/renders, including symlink targets. Temporary
snapshots are removed after completion/failure. Local daily SQLite files are renamed atomically after completion.
The backup does not include failed provider takes, temporary files, credentials, or unrelated local artifacts.

Run explicitly from the service environment:

```sh
npx tsx scripts/backup-offsite.ts upload
npx tsx scripts/backup-offsite.ts verify seamcut/snapshots/ACTUAL-MANIFEST.json /tmp/seam-restore-NEW
```

Verification downloads every object to a new isolated directory, checks size/SHA-256, SQLite integrity/foreign keys,
and coverage of all media references. It refuses an existing destination or a directory inside the live data root.
It never replaces production data. Restore to the same absolute data root after stopping all writers (follow the
restore procedure above), or explicitly migrate embedded absolute paths before serving from another root.

Configure retention deliberately: manifests share content-addressed media objects, so do NOT expire objects by age
while retaining manifests that reference them. This implementation does not delete remote objects. Configure bucket
storage/budget alerts; add a reference-aware retention policy before usage grows. `uploaded` proves the last upload,
not a successful restore drill; the new test covers a simulated object-store round trip, corruption, missing media,
and traversal refusal. A real bucket upload/retrieval remains required.

## Generation latency (2026-09-17)

The preceding live coffee/ocean flow spent about 33 seconds on analysis and 62 seconds from generation request to ready.
Its accepted H3 Max attempt took 26 seconds including normalization and judging; that attempt timer excluded the director
and final assembly. The local 28-style sweep had median analysis 24.3 seconds; its 16 accepted runs had median generation
28.1 seconds. Those are different environments and workloads, not interchangeable benchmarks.

The pipeline now overlaps the two independent clip-vision requests, source trimming with director/provider network waits,
and pixel-fidelity scoring with the vision judge. Source encodes remain sequential to limit CPU contention; outstanding
preparation is drained on failure before releasing the worker slot. All judges, scores, nine vision samples, fidelity floors,
retry limits, and output encoding settings are unchanged.

Judge samples use one FFmpeg decode with several outputs instead of one decode per image. A missing final sample caused by
an audio-only tail still uses the old seek-from-end fallback. If a branch makes FFmpeg fail, completed JPEGs are decoded for
validation before reuse. Regression coverage compares decoded pixels against the old individual seeks at integer/fractional
frame rates, on a one-frame clip, and with an audio tail. A local alternating-order benchmark on two saved production bridges
(three repetitions each) measured seven samples at 485 ms -> 326.5 ms and nine at 615.5 ms -> 372 ms. This is a local media-stage
measurement, not a claim of a 33–40% reduction in total production generation time.

Attempt params now include `timings.directorMs`, `providerMs` (including queue, polling and download), `normalizeMs`, and
`judgeMs`. The `generation_succeeded` event and completion log include source-preparation total/wait, stitch, and export times;
`analysis_completed` includes the combined frame-vision wall time. Overlapped durations must not be added as though serial.
Use these measurements before changing models, encoder presets, or server size. Further model races consume extra credits;
faster director/judge models need held-out quality comparisons before activation.
