# SeamCut

Live preview deployment: https://seamcut.onrender.com (Render Docker service `seamcut`, see `docs/deploy-render.md`; deploys are manual from the Render dashboard).

**Turn any two clips into one impossible shot.** Upload two clips. AI figures out the transition.

Seam is an AI transition director: it looks at the end of clip A and the start of clip B, decides which
transition the footage actually supports, writes the generation prompt, routes it to a video model,
judges the result, retries when needed, and stitches a finished edit. Users never see prompts, models,
frames or parameters — they see four recommendations, a *Surprise me* button, and a video.

## Run it

```bash
npm install
npm run samples          # renders synthetic sample clips (no real footage required)
npm run dev              # http://localhost:3000
```

Requirements: Node 20+, `ffmpeg`/`ffprobe` on PATH (or `FFMPEG_PATH` / `FFPROBE_PATH`).

With no API keys Seam runs fully local: heuristic visual analysis, a procedural ffmpeg bridge
(the *preview* tier), and a heuristic quality judge. Copy `.env.example` to `.env.local` to enable:

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
- `/create` — two drop zones → *Understanding your clips* → four lanes (Smooth, Cinematic, Viral, Insane) + Surprise me → progress → result with
  Download full edit / Download transition only / Try another / Make wilder / Make smoother / Regenerate / Share / Fine tune.
- `/library` — every transition recipe, by category, with looping previews. Pick one, bring your clips.
- `/t/:id` — public share page (Clip A → transition → Clip B, "Make one with your clips").
- `/ops` — funnel, latency, quality, retries, cost per generation, per model, per recipe.

## How it decides

1. **Boundary frames** — the last 1.5 s of A and first 1.5 s of B are sampled; each frame gets cheap pixel features
   (sharpness, light, motion, drift, occlusion). The best candidates go to the analyzer; the final pair is chosen with the analysis in hand.
2. **Visual understanding** — structured analysis per frame (subjects, composition, geometry, motion, depth, colour, materials, risks)
   plus a pair analysis (relationships and concrete ideas mapped to recipe ids).
3. **Transition grammar** — motivations are detected (camera movement, direction, zoom, object crossing the lens, lighting change, shape match,
   location change…). Every recipe in the catalog is scored: semantic, geometry, motion, continuity, artifact risk, wow. Unmotivated flashy
   moves are pushed down; when nothing motivates a move, a *Clean Cut* wins the Smooth lane.
4. **Prompt compiler** — analysis + recipe + intent → a model-agnostic IR (source, destination, transition, continuity, camera, bridge, end,
   preserve, avoid) → rendered per provider dialect.
5. **Router → provider → judge → retry** — models are ranked per transition class and mode; output is time-remapped, judged
   (start/end fidelity, subject consistency, continuity, artifacts, aesthetics), retried with calmer settings or a safer recipe, and the
   procedural bridge guarantees an output.
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

See `ARCHITECTURE.md` for the module map, data model and the multi-clip director plan.

## Production

Deployed on Render from `render.yaml`; see `docs/deploy-render.md` for the blueprint and `docs/production.md` for the readiness checklist, owner steps and known gaps.
