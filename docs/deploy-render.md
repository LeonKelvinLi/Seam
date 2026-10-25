# Render preview deployment

> Historical initial-deployment walkthrough. Current production uses `https://clipmelt.com`, AI providers,
> and automatic deployment after passing CI, as configured in `render.yaml`. It does not force local FFmpeg.
> Read [current production verification](production.md#current-verification) before following the older setup
> steps below. The runtime image includes `node --import tsx scripts/backup-offsite.ts --help` for backup
> upload and isolated restore verification; private S3/R2 configuration is still required.

This deploys the existing Next.js app as one Docker web service. Preview generation is forced to the
local ffmpeg provider. OpenAI remains the optional visual analyzer; no Anthropic integration is required.

## Files and runtime

- `Dockerfile`: Node 22 on Debian Bookworm, ffmpeg/ffprobe, Linux-built SQLite and sharp dependencies,
  a production Next.js build, and `next start` on `0.0.0.0:$PORT` (default `10000`).
- `render.yaml`: a `1c-2g` web service named `seamcut`, 10 GB persistent disk at `/var/data`, app data at
  `/var/data/seam`, one local preview attempt, and `/api/runtime` health checks. Auto-deploys are off
  so the tested commit can be deployed deliberately.
- `.dockerignore`: an explicit allowlist. Local `.env*`, SQLite files, uploads, marketing ads, source
  footage and review outputs never enter the Docker build context.
- `docs/deploy-assets.json`: versioned SHA-256 inventory of the exact public files this release needs.
  `docs/verify-deploy-assets.mjs` verifies it before the Docker build proceeds.

The runner keeps TypeScript in `node_modules` because this project uses `next.config.ts` at startup.
Build compilers are confined to the build stage. The container does not copy the local `data/` directory;
the deployed preview starts with a separate database and preserves its subsequent uploads and exports
on the attached disk.

## Ship the selected demo files

The existing `.gitignore` excludes the videos and posters used by the app. A normal `git add .` alone
would produce broken homepage films, sample pairs and library previews on Render.

The release inventory includes all eight public example entries, their before/after clips and endpoints,
the coffee 4K and mobile versions, the eye/window mobile versions, sample clips/posters, and the library
previews. It excludes `public/ads`, `public/examples/src`, unused render variants and project media.
Every selected file is below the ordinary GitHub per-file limit; this release can keep these bounded
demo binaries directly in Git without requiring a separate asset service or a generation step on Render.

Verify the bytes, then explicitly version only the inventory paths:

```bash
node docs/verify-deploy-assets.mjs
node docs/verify-deploy-assets.mjs --paths > /tmp/seam-deploy-assets.txt
git add -f --pathspec-from-file=/tmp/seam-deploy-assets.txt
git add Dockerfile .dockerignore render.yaml docs/deploy-render.md docs/deploy-assets.json docs/verify-deploy-assets.mjs
```

These commands are instructions, not evidence that the files are committed or pushed. When an approved
demo changes, update its manifest hash and byte count, increment the manifest version, and update the
Docker allowlist if a path was added or removed. Do not remove the broad `.gitignore` protections or
force-add entire media directories. Check the manifest again in the final Git checkout used for deploy.

## Configure and verify

1. Finish the local production build and end-to-end preview test, including two uploads into one project,
   recommendations, local generation, full/bridge downloads, and a share link.
2. Push the tested source plus the selected asset files, and connect that repository to a Render Blueprint.
   Review the `1c-2g` compute and 10 GB disk in the service configuration. This is a paid service; no
   billing operation is performed by writing these files.
3. Keep `SEAM_FORCE_PROVIDER=local` and `SEAM_DEFAULT_MODE=preview`. The preview needs no API key.
   To enable paid OpenAI visual analysis, privately add `OPENAI_API_KEY` in Render's Environment settings;
   never put it in the YAML, a Docker build argument, Git, or any `NEXT_PUBLIC_*` variable.
4. Keep the Docker Command blank so Render uses the image's `CMD`. Render supplies `PORT`.
   Set `SEAM_PUBLIC_URL` to the actual HTTPS domain if an explicit share-link origin is needed;
   otherwise the app derives the request origin.
5. Wait for the actual deploy to become healthy, then verify the deployed homepage films, mobile
   variants, before/after comparison, sample uploads, library previews, generation and downloads.
   `/api/runtime` confirms the process responds; it does not prove ffmpeg generation or disk persistence.
6. Create a small test project on the deployed service, retain its project/share URL, restart the service,
   and verify that project and its exports still load. Check current disk use and service memory.

## Private operations metrics

`/ops` and `/api/metrics` are disabled by default in production and return 404 before reading global
usage/cost metrics. Development access is unchanged. To enable operator access, privately set
`SEAM_OPS_TOKEN` in Render and send `Authorization: Bearer <token>` with each request. Ordinary browser
navigation still receives 404; there is no public login screen or token in a URL, cookie, page payload,
or client bundle. Use an authenticated operator client or trusted proxy for access. Keep this token
server-only and out of Git. The public upload/generate/download/share flow does not use this token.

## Limits that affect this release

The disk is available only at runtime and only to this service's single instance. Render services with
persistent disks cannot horizontally scale and do not have zero-downtime deploys. The in-process job
runner and SQLite therefore remain together. Render does not allow a custom shutdown delay on services with a disk, so the default applies;
that is not a guarantee that an active ffmpeg job survives a redeploy.

The app buffers uploads and can run two media jobs concurrently. The `1c-2g` plan provides more room
than 512 MB, but memory safety under maximum 500 MB uploads or sustained traffic has not been proven.
Uploaded source files, proxies, frames and exports accumulate on the 10 GB disk; no retention/cleanup
policy is implemented by this deployment. Monitor storage before inviting sustained public usage.

Prepared configuration is not a successful Linux container build or a live deployment. Verify the
Render build log confirms `npm ci`, native modules, asset verification and `next build`, then complete
the deployed checks above before calling this release live and working.

References checked 2026-09-05: [Render Docker](https://render.com/docs/docker),
[web-service ports](https://render.com/docs/web-services),
[Blueprint fields and compute plan IDs](https://render.com/docs/blueprint-spec),
[persistent disk limitations](https://render.com/docs/disks). Next.js behavior was checked against this
checkout's `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`.

## Stripe (live objects created 2026-09-06)

Live products, one-time prices and Payment Links exist in the BEASTY LLC Stripe account for the three
credit packs (Starter $9/50, Pro $29/250, Studio $89/1000); their IDs and link URLs are non-secret and
live in `render.yaml` and `.env.local`. A live webhook endpoint points at `https://seamcut.onrender.com/api/stripe/webhook`
for `checkout.session.completed`. Two values must be pasted into Render → seamcut → Environment by a
person, never committed:

- `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys (a restricted key with Checkout Sessions
  write and Webhook read is enough).
- `STRIPE_WEBHOOK_SECRET`: the signing secret of the endpoint above; it is stored locally in `.env.local`.

Until both are set, the deployed pricing page uses the Payment Links and purchases are not credited.
Payment Links redirect to `https://seamcut.onrender.com/account?paid=1` after checkout.
