# Seam architecture

Next.js 16 (App Router) + TypeScript. One process runs the UI, the API and the job runner; the job table is durable so a
separate worker can drain it later without changes. SQLite (better-sqlite3) for state, ffmpeg for media, sharp for pixels,
Claude for understanding and judging, fal.ai / Runway for generation, a procedural ffmpeg provider as preview tier and safety net.

## Module map (`src/`)

| Path | Responsibility |
|------|----------------|
| `core/types.ts` | Domain entities: Project, Asset, ExtractedFrame, VisualAnalysis, PairAnalysis, TransitionOpportunity, Recommendation, Generation, GenerationAttempt, QualityEvaluation, Export, Share, Job, LearningRecord, CostEntry, AnalyticsEvent |
| `db/` | Schema + typed repository (JSON/boolean hydration, atomic job claiming) |
| `core/media/` | ffmpeg/ffprobe wrappers (proxy spec, frames, Ken Burns stills, xfade, time-remap, stitch), sharp helpers, storage paths |
| `core/analysis/` | Pixel features, boundary frame selection, zod schemas for vision output, heuristic analyzer, Claude analyzer, facade |
| `core/recipes/` | The transition catalog (48+ structured recipes) and registry |
| `core/director/` | Transition grammar (motivations, restraint, sound bridges) and footage curation (best moments, story order) |
| `core/opportunities/` | Recipe × footage scoring, four lanes + Surprise me, wilder/smoother stepping |
| `core/prompt/` | PromptIR compiler and provider dialects (kling, runway, generic) |
| `core/providers/` | `TransitionProvider` interface, local/fal/runway implementations, registry, router |
| `core/quality/` | Heuristic + Claude judges, pass criteria, retry policy |
| `core/pipeline/` | Job runner, analyze job, generate job, human stage labels |
| `core/learning/` | Per-generation learning records, learned model quality for the router |
| `core/observability/` | Funnel, latency, quality, retry and cost metrics |
| `lib/server/` | Session (anonymous cookie), ingest, view models, generation creation, share payloads |
| `app/api/*` | Route handlers (upload, projects, analyze, generate, generations, feedback, share, media streaming with Range, events, metrics, recipes, samples, runtime) |
| `app/*`, `components/*` | Home demo, create flow, library, share page, ops |

## Pipeline

```
UPLOAD -> TRANSCODE (proxy spec) -> FRAME EXTRACTION (boundary windows) -> VISUAL ANALYSIS (per frame, per pair)
      -> OPPORTUNITIES (scored recipes) -> RECOMMENDATIONS (lanes) -> [user picks]
      -> PROMPT COMPILATION -> ROUTE -> GENERATE -> NORMALISE (time-remap) -> JUDGE -> RETRY? -> STITCH -> EXPORT
```

Stages surface to the user as: Preparing your clips → Understanding your clips → Designing the transition →
Generating the camera move → Checking the result → Making the cut seamless → Ready.

## Recipes are the IP

A recipe is not a prompt. It carries requirements and boosts (shapes, relationships, materials, subjects, framing, motion),
contraindications (faces near the boundary, text, fast motion, dark frames, many subjects), the motivations that earn it,
prompt fragments (camera behaviour, bridge, end), expected visual structure and quality criteria for the judge, risk factors,
a model class for routing, a safer alternative for retries, a procedural fallback, human title/why templates, a sound-design
suggestion, and a prompt version so learning data stays comparable. Creator packs (future marketplace) are just recipe sets.

## Transition grammar (decision system)

`core/director/grammar.ts` implements the editorial rules: detect what motivates a cut (camera/subject movement, direction,
zoom, object passing the frame, body movement, lighting change, location change, composition similarity, shape and colour
match, plus beat/dialogue/sound-effect hooks for the audio phase), score how strongly each recipe is earned, penalise
unmotivated flashy moves, cap intensity when dialogue crosses the cut, and promote a clean cut when nothing supports more.

## Model routing

`ModelSpec` declares first/last-frame support, durations, cost per second, tier (preview/final/both) and per-class strengths.
The router ranks available models by class strength (blended with learned quality once ≥3 records exist), tier fit and cost,
and always appends the local procedural model. Failed models are excluded on retry.

## Quality + retries

Judge scores: start fidelity, end fidelity, subject consistency, continuity, artifacts, aesthetic, transition success, overall.
Heuristic fidelity acts as a floor under the model judge. Below threshold: retry with lower creativity/camera movement and
fidelity-heavy prompt wording, switch model on artifacts or provider errors, and on the last attempt switch to the recipe's
safer alternative with a user-facing suggestion ("This footage is fighting the fly-through…").

## Cost + learning + funnel

Every attempt records provider/model, prompt version, params, duration, cost and quality; user reactions (download, share,
regenerate, wilder, smoother) flag the learning record. `/ops` shows the funnel (landing → upload → analysis → selection →
generation → success → download → second project), latencies, retry frequency and cost per successful generation.

## Phase 2: multi-clip AI director

- **Curation** (`core/director/moments.ts`): best 1.5 s moments per clip from the cheap features; near-duplicates collapse;
  marginal-value cut ("would the video be worse without it?"); ordered hook → progression → strongest → calm ending.
- **Compatibility graph**: clips are nodes, pair analyses are edges scored by the same opportunity scorer; the sequence is the
  best path, then bridges are generated per edge with the existing pipeline.
- **Music**: beat/drop/phrase analysis feeds `AudioContext` into the grammar (calm → smooth, build-up → more camera, drop → strongest).
- Everything above reuses the two-clip modules unchanged; only the planner is new.
