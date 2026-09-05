# Seam

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
| `ANTHROPIC_API_KEY` | Claude vision: subjects, shapes, motion, depth, materials, transition ideas in human language, and the quality judge |
| `FAL_KEY` | Kling 2.1 (standard = preview tier, pro = final tier) via fal.ai, first + last frame |
| `RUNWAYML_API_SECRET` | Runway Gen-4 Turbo, first + last keyframes |

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

## Sample and example media

`public/samples` and `public/examples` ship with eight generated pairs (stills from Kling 3 Omni, footage and first/last-frame
bridges from PixVerse V6 via OpenArt, 2026-09-05). They are demo material, not user footage. `npm run samples` renders vector
stand-ins for any pair that is missing; `scripts/import-generated.ts mapping.json` imports new externally generated pairs
(`a` must end on the bridge's first frame, `b` must start on its last frame; set `reverseA` when `a` was generated from that frame).

See `ARCHITECTURE.md` for the module map, data model and the multi-clip director plan.
