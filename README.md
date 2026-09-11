# SeamCut

Live preview deployment: https://seamcut.onrender.com (Render Docker service `seamcut`, see `docs/deploy-render.md`; deploys are manual from the Render dashboard).

**Turn any two clips into one impossible shot.** Upload two clips. AI figures out the transition.

Seam is an AI transition director: it looks at the end of clip A and the start of clip B, decides which
transition the footage actually supports, writes the generation prompt, routes it to a video model,
judges the result, retries when needed, and stitches a finished edit. Users never see prompts, models,
frames or parameters — they see three recommendations, a *Surprise me* button, and a video.

Every transition SeamCut offers is a seamless AI bridge: a generated shot that starts on the last frame of clip A and
lands on the first frame of clip B, so the join is not meant to be visible. Effect moves (crash zoom, whip pan, spin,
tunnel rush, explosions) and plain cuts or dissolves stay in the catalog for older generations but are never offered.

## Run it

```bash
npm install
npm run samples          # renders synthetic sample clips (no real footage required)
npm run dev              # http://localhost:3000
```

Requirements: Node 20+, `ffmpeg`/`ffprobe` on PATH (or `FFMPEG_PATH` / `FFPROBE_PATH`).

With no API keys Seam runs fully local for development and CI: heuristic visual analysis, a procedural ffmpeg
bridge, and a heuristic quality judge. Once a bridge model is configured, that procedural bridge is never delivered —
a run that no AI bridge passes fails and refunds its credits instead of shipping a crossfade (`SEAM_ALLOW_PROCEDURAL=1`
re-enables it deliberately). Copy `.env.example` to `.env.local` to enable:

| Key | Unlocks |
|-----|---------|
| `OPENAI_API_KEY` | OpenAI vision: subjects, shapes, motion, depth, materials, transition ideas in human language, and the quality judge |
| `FAL_KEY` | Kling 2.1 (standard = preview tier, pro = final tier) via fal.ai, first + last frame |
| `RUNWAYML_API_SECRET` | Runway Gen-4 Turbo, first + last keyframes |

OpenAI vision and judging use `gpt-5.4-mini` through the Responses API with JPEG frame inputs,
strict JSON schemas and low reasoning effort. `SEAM_VISION_MODEL` and `SEAM_JUDGE_MODEL` can override
the defaults with a compatible model. Refused, incomplete or invalid responses fall back to the
heuristic analyzer/judge; runtime labels record which actually ran. OpenAI token cost estimates
cover GPT-5.4 Mini standard rates, including cached input; other model overrides currently have
no cost estimate. These estimates are not billing totals. See the official
[image input guide](https://developers.openai.com/api/docs/guides/images-vision),
[structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs) and
[model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

Optional scripts:

```bash
npm run pipeline:smoke                 # headless ingest -> analyze -> recommend -> generate -> stitch on a sample pair
npx tsx scripts/build-library-previews.ts   # looping preview per recipe for /library
npx tsx scripts/build-examples.ts      # homepage before/after examples (drops real footage into public/examples/src/<id>/)
npm test                               # unit + ffmpeg integration tests
```

## Product surface

- `/` — the demo (before: hard cut, after: Seam), example switcher, one CTA.
- `/create` — two drop zones → *Understanding your clips* → three lanes (Invisible, Cinematic, Transformation) + Surprise me → progress → result with
  Download full edit / Download transition only / Try another / Make wilder / Make smoother / Regenerate / Share / Fine tune.
- `/library` — real AI bridges from the example set, then every seamless effect with the footage it needs. Once clips are uploaded,
  each effect is graded for them (Great fit / Could work / Poor fit, with the reason); a poor fit cannot be picked, and the server
  refuses it before any credit is charged.
- `/t/:id` — public share page (Clip A → transition → Clip B, "Make one with your clips").
- `/ops` — funnel, latency, quality, retries, cost per generation, per model, per recipe.

## How it decides

1. **Boundary frames** — the last 1.5 s of A and first 1.5 s of B are sampled; each frame gets cheap pixel features
   (sharpness, light, motion, drift, occlusion). The best candidates go to the analyzer; the final pair is chosen with the analysis in hand.
2. **Visual understanding** — structured analysis per frame (subjects, composition, geometry, motion, depth, colour, materials, risks)
   plus a pair analysis (relationships and concrete ideas mapped to recipe ids).
3. **Transition grammar** — motivations are detected (camera movement, direction, zoom, object crossing the lens, lighting change, shape match,
   location change…). Every recipe in the catalog is scored: semantic, geometry, motion, continuity, artifact risk, wow. Unmotivated flashy
   moves are pushed down; when nothing motivates a move, the calmest seamless bridge wins the Invisible lane.
4. **Prompt compiler** — analysis + recipe + intent → a model-agnostic IR (source, destination, transition, continuity, camera, bridge, end,
   preserve, avoid) → rendered per provider dialect.
5. **Router → provider → judge → retry** — models are ranked per transition class and mode; output is time-remapped, judged
   (start/end fidelity, subject consistency, continuity, artifacts, aesthetics), and retried with calmer settings, the next-best
   bridge model, or a safer seamless recipe. Nothing that fails the bar ships, and a pixel check (`src/core/quality/seamless.ts`)
   fails any take with a cross-dissolve or a hard cut whatever the judge scored. Bridge models all take both boundary frames:
   Higgsfield DoP leads, MiniMax Hailuo-02 is the last resort, and Veo 3.1 waits until the Higgsfield account is enabled for
   it (`npx tsx scripts/probe-higgsfield.ts` checks at no cost). None of their APIs has a negative prompt, so the Higgsfield
   prompt is a plain shot direction with the no-cut and one-object rules written in.
6. **Stitch** — A is cut at the chosen frame, B resumed at its chosen frame, short video and audio crossfades at both seams.

## Accounts and payments

Accounts work with no extra setup: email + password (scrypt), sessions in SQLite, and a guest's projects are adopted on
sign-in. Every new account starts with 5 credits; a preview transition costs 1 credit, a final-quality one costs 3, and a
failed generation refunds its credit. Pages: `/signup`, `/login`, `/account`, `/pricing`. API: `/api/auth/{signup,login,logout,me}`.

Stripe, two options (both grant credits through the same webhook):

1. **Checkout sessions (recommended).** In the Stripe dashboard create three one-time Products/Prices (Starter $9 → 50 credits,
   Pro $29 → 250, Studio $89 → 1,000), then set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_STARTER|PRO|STUDIO` in `.env.local`.
2. **Payment Links.** Create a Payment Link per pack in the dashboard and paste the URLs into `STRIPE_LINK_STARTER|PRO|STUDIO`.
   The app appends `client_reference_id=<userId>` so the webhook can credit the right account.

Then add a webhook endpoint in Stripe pointing at `https://<your-domain>/api/stripe/webhook` for the event
`checkout.session.completed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. For local testing:
`stripe listen --forward-to localhost:3000/api/stripe/webhook`. Packs and prices live in `src/lib/server/billing.ts`.

## Sample and example media

`public/samples` and `public/examples` ship with eight generated pairs (stills from Kling 3 Omni, footage and first/last-frame
bridges from PixVerse V6 via OpenArt, 2026-09-05). They are demo material, not user footage. `npm run samples` renders vector
stand-ins for any pair that is missing; `scripts/import-generated.ts mapping.json` imports new externally generated pairs
(`a` must end on the bridge's first frame, `b` must start on its last frame; set `reverseA` when `a` was generated from that frame).
The home page films (`coffee-ocean` in the hero, `eye-space` and `window-clouds` in the scroll story) also ship an
`after-4k.mp4` for desktops. The two story films are Topaz 4K upscales of the 720p edits (2026-09-11), encoded as H.264
with a keyframe every 0.5 s so scroll scrubbing stays smooth. `public/examples/*/` is gitignored: add new example files
with `git add -f` and pin them in `docs/deploy-assets.json` and `.dockerignore`, or the deploy's asset check fails.

`public/library-ai` holds a real AI preview for each seamless style the example set does not already show (20 styles,
2026-09-10). Each has start and end stills from GPT Image 2 (high quality, 2k) and a 4 s first→last-frame bridge from
Higgsfield Cinema Studio 3.0 at 720p, reviewed frame by frame before import. Two were regenerated once: Foreground Pass
(the first take hid a hard cut behind the coat) and Object Morph (two planes on screen at once). Add or replace previews
with `node scripts/import-library-previews.mjs previews.json`; the eight example bridges cover the remaining styles
through `EXAMPLE_PREVIEWS` in `src/app/api/recipes/route.ts`. To make a preview with the product itself instead,
`SEAM_FORCE_PROVIDER= SEAM_DATA_DIR=/tmp/seam-proof npx tsx scripts/proof-previews.ts <effect> <start> <end> <outDir>` runs one
effect through the full pipeline on a designed pair (real provider credit) and keeps the bridge and the finished edit; add
`SEAM_FORCE_MODEL=<model id>` to prove one model instead of the router's pick. Cinema Studio is not on the developer API,
so its previews show what a style can look like rather than what the app's own models deliver: the first Object Morph
proof run (2026-09-10) came back as a cross-dissolve on DoP Lite and a melt on Hailuo-02. `npx tsx scripts/check-seams.ts
<videos>` runs the dissolve and cut check on any clip.

See `ARCHITECTURE.md` for the module map, data model and the multi-clip director plan.

## Production

Deployed on Render from `render.yaml`; see `docs/deploy-render.md` for the blueprint and `docs/production.md` for the readiness checklist, owner steps and known gaps.
