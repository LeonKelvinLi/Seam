# Implementation and local verification

Implemented the approved dark media direction on top of production c41c857.
Generation/provider updates remain intact. The homepage opens with a selectable
airplane, coffee or wheel film, large dimensional source/result planes, and an
actual playback-driven timeline. A full-screen airplane chapter leads into an
asymmetric screening gallery, then a dark process explanation containing an
actual frame from the generated transition. The site chrome shares the darker
palette and muted silver type.

Native document scrolling remains unchanged. The existing eased video seek loop
now also publishes entry/exit progress for frame expansion and dimensional
scene alignment. Source planes sit behind the result to avoid 3D intersections.
Gallery previews mount only for hover/focus intent, pause offscreen, and stop
behind the full before/after dialog. No animation dependency was added.

## Media

- Three 960px-wide, 24fps, muted H.264 preview files, faststart, CRF27, 48-frame
  GOP. Sizes: airplane609604B, coffee1097179B, wheel947400B.
- Existing 720p frequent-keyframe airplane film remains the scroll source.
- Nine matching WebP thumbnails total212398B versus743556B for JPEGs (71.4% less).
- Three midpoint stills extracted from existing bridge.mp4 files and encoded as
  WebP. No new AI generation was performed.
- Fifteen new public media derivatives are individually listed and hashed in
  docs/deploy-assets.json; all209 assets verify. Only approved public example
  media is included.

## Chrome checks

- At1800px: large hero film and full-width dark page; featured-film selection
  changes footage, source frames, labels and full-example action together.
- The hero playback variable matches video position. The full dialog loads
  the corresponding MP4, pauses background playback, closes with Escape and
  restores focus. Focused gallery card then plays its lightweight preview.
- At390px: no horizontal overflow;34.8px between result panel and timeline;
  process footage has30.8px clearance before the first explanatory step.
- At650px: no overflow;16.8px result/timeline clearance. At1024px: responsive
  composition corrected and rechecked,30.6px clearance with no overflow.
- At844×390: scroll stage is318px high under the72px header; text/actions fit.
- At390×844: pinned airplane stage is772px high; scroll advances real video
  time and exits normally. Dark process background is rgb(13,16,21).
- Reduced-motion on initial load: both background sources absent, videos paused,
  zero active CSS animations. Manual motion-off also removes idle animations,
  pauses the hero, and changes the scrub stage to normal document flow.
- Temporary Chrome viewport and media-preference overrides reset afterward.

Typecheck, deployment asset hashes and initial production build passed. Final
release verification is completed through CI and the deployed version check.
