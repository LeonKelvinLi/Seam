```text
/make-plan Redesign the Clipmelt homepage visual composition for a dark media
environment with stronger 3D and scroll choreography. Current audit:14/30;
presentation clarity, aesthetics and decorative competition each scored1.

Verdict: REDESIGN the homepage's visual composition and motion choreography around
a continuous dark editing environment, preserving its working creation, comparison,
native-scroll and accessibility behavior. Total14 is below the rubric threshold.

Primary user: creators joining two existing shots. Primary task: understand the
AI transition, inspect a real result, then create one. Brand Clipmelt;
clipmelt.com; Next16.3.4; CSS modules; actual repository
/Users/leon/Desktop/dev/Seam-redesign. Read bundled Next docs and AGENTS first.

Preserve: explicit AI-transitions headline/one-click creation (CinematicHome.tsx:
313-334), airplane-to-mountains scrub film and eased native scroll (181-205,449-475),
real before/after dialog (743-819), keyboard and reduced-motion controls (257-264,
298-309), Space Grotesk/DM Sans and iris accent (app/layout.tsx:10-11,CSS:1-10).

Discard: full-screen #f0f1f6 process section and white frames (CSS:575-579,646-655;
failure#3); generic lavender AI text plane (680-699;#4); unsynchronized 7.8s
decorative playhead (1633-1634;#4/#6); redundant orbit/empty-layer decoration
(TSX:358-390;#5). Keep real media and original-vs-generated labels.

Priority moves from the audit:
1. Aesthetic (#3): replace the full-width paper process section, white photo frames
   and pale AI plane with charcoal surfaces and real transition frames.
   Evidence: 01-evidence.md, Visual evidence and Copy and actual media.
2. Useful/understandable (#2/#4): move prominent media beside the hero message,
   label original footage versus generated transition, and bind visible playback
   indicators to real playback. Evidence: 01-evidence.md, Structure and Copy.
3. Unobtrusive (#5): choreograph three stronger scroll moments from actual footage
   planes instead of accumulating independent orbit/tag/shape loops.
   Evidence: 01-evidence.md, Structure and Weight and friction.
4. Thorough/resource-conscious (#8/#9): retain native scroll, reduced-motion,
   pause control, visibility gating and responsive clearances; measure video
   loading, frame contrast and scrolling on a modest mobile device.
   Evidence: 01-evidence.md, Visual evidence and Weight and friction.

All findings needed for the plan are quoted above; no external audit lookup is
required. Existing hero media starts near y636 at1800×931; the white process
section occupies1004px of6502px document. Build-derived initial JS~146KB gzip,
actual request count/TTI unknown. Current hero has9 CSS loops+1 video, gated.

Proposed tokens: cinema#050608, charcoal#11151b, edge#28303b, silver#d4d8df,
secondary#949dab, iris#ab9af2. Dark surfaces throughout, no large white fills.
Type remains Space Grotesk display and DM Sans body. Layout: left message + large
right footage assembly, full-screen airplane scrub, dark process timeline,
perspective example filmstrip, compact FAQ and closing CTA. Keep primary actions
stationary. Use genuine footage, not invented technology or generic particles.

Motion: source planes align into result over first scroll; result opens toward
the viewer into the airplane scene; example strip unfolds into readable frames.
Keep the current scroll-controller/native-scroll architecture. Sequence one
scene at a time; no new simultaneous autoplay videos. Desktop depth reduces
on mobile; static storyboard when motion is off. Need no new animation library
unless measurement demonstrates a necessary capability gap.

Deliver new IA, current-vs-new wireframe, token spec, choreography thresholds,
loading/error/focus/reduced-motion states, scoped file changes and verification.
No account or route migration: replace the homepage presentation only. Cutover
requires local Chrome desktop/mobile scroll, no overlap/overflow, dialog/keyboard
QA, media-contrast review, typecheck/build/workflow checks and final live QA.
Do not change pricing, providers, billing, login or unrelated uncommitted work.
```
