# Production readiness (updated 2026-09-09)

Status of the SeamCut deployment at https://seamcut.onrender.com. "Done" means implemented, tested locally and
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
| Free trial | Every new guest or account gets exactly 3 preview runs (`FREE_TRIAL_RUNS`); the fourth run returns 402 and the studio shows an inline paywall with the packs. New guest identities are capped at 10 per IP per day. |
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
| Pricing that clears provider cost | A preview costs 2 credits, a final render 6. Packs: Starter $9 = 30 credits (15 previews, $0.60 each), Pro $29 = 120 ($0.48), Studio $89 = 400 ($0.45); an accepted AI preview costs about $0.36 to $0.42. Live Stripe products and Payment Links carry the new credit counts. Free trial is still 3 runs (6 credits). |
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
