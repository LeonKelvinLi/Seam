# Evidence from baseline 6870b81

## Structure and understanding
The old H1 was “Make the cut. Break reality.” while the explicit AI product explanation was subordinate (CinematicHome.tsx:263–264). Responsive CSS hid explanation/source captions (CinematicHome.module.css:94,114,123). Homepage had 15 authored controls plus dialog controls; shared shell had 15 navigation controls. Pricing was footer-only (layout.tsx:34–45). The story was 420svh desktop/380svh mobile before the process explanation (module.css:37,137).

## Visual and detail
Six global color tokens expanded into 75 distinct hex literals across global and homepage CSS. System sans, monospace labels and Georgia secondary headings mixed in the baseline. Sampled static homepage contrast was at least 6.03:1, but video-overlay contrast wasn't measured (globals.css:3–12,20,35; module.css:43,49,57). Loading/error/success/empty/focus/disabled states existed across the app, but Account silently swallowed fetch failure (Account.tsx:13–14); Pricing did likewise (Pricing.tsx:16,36).

## Copy and honesty
AI connects selected boundary frames and output stitches A/bridge/B (generate-job.ts:131–137,335–353). Preview costs 2 credits and packs are $9/12, $29/44, $99/170 (billing.ts:20–22,38). New takes also cost credits, but regeneration group didn't state cost (CreateFlow.tsx:324–335). Homepage ETA differed from studio ETA. Pricing exposed developer Stripe setup instructions (Pricing.tsx:46). Existing final-quality backend mode has no current create UI selector; avoid promoting it as an available primary control.

## Weight and motion
Baseline: three mounted videos, one visibility-gated loop, two scrub videos; two large HD blobs downloaded as story approached, even with motion disabled (CinematicHome.tsx:112–138). Four continuous CSS elements (three equalizer bars and arrow) plus one loop. No animation library dependency. Runtime initial JS bytes/request count/TTI were not measured; no fabricated estimates.

Reports were gathered independently for structure, visual/weight, and copy. Exact baseline references above remain anchored to 6870b81 because redesign replaces the files.
