# Implementation and verification

The redesigned homepage explains AI transitions through actual source frames,
generated example films, a source/AI/source timeline, a perspective footage
assembly, and a scroll-controlled transition. The same typography, navigation,
and color system now extends to the studio, library, login, pricing, and account.
Existing upload, generation, authentication, credit, and checkout endpoints remain
in use. No animation dependency or paid generation was added for this work.

## Scroll corrections

- Removed the section's extra 72px scroll margin; the document already reserves
  the sticky header through scroll padding. Anchor navigation now places the
  scene at 72px rather than 144px.
- Kept the initial section geometry stable while reading the motion preference,
  avoiding a height change during hydration for visitors with motion enabled.
- Grouped geometry reads before CSS writes in the scroll frame callback.
- Shortened the pinned section to 190svh on desktop and 160svh on small screens.
- Sized the 3D hero by viewport width so its output panel clears the timeline.
- Used the actual stage height for video progress and made the stage fit short
  landscape viewports. Native scrolling remains in control throughout.

## Verified locally in Chrome through the installed extension

- Desktop scroll advances and reverses normally; the film playhead follows the
  scene and the scene releases into the process section.
- At 650 x 844, the hero output clears the timeline by approximately 55px with
  no horizontal document overflow.
- At 844 x 390, the pinned stage begins at 72px and is 318px tall. Heading,
  playback control, timeline, labels, and next-section link fit within it.
- At 390 x 844 with reduced motion emulated, the scene is static, both background
  videos have no source and remain paused, and there is no horizontal overflow.
  The emulation was reset after testing.
- Mobile navigation opens and closes on selection. Pricing, studio, and login
  render with the new system. The example dialog plays the original hard cut,
  closes with Escape, and restores focus.
- The process AI panel stays in front of the source image; its light-section
  links use a dark focus indicator and the footer copy meets 4.5:1 contrast.

## Automated validation

- TypeScript check passed.
- Production build passed.
- 116 unit/integration tests passed before the final scroll-only adjustments.
- Local production E2E passed: uploads, analysis, local FFmpeg generation,
  downloadable output, credit debit, and insufficient-credit response. This is
  flow validation with `SEAM_FORCE_PROVIDER=local`, not a paid AI-provider test.
- Deploy asset manifest verified: 194 files, 201.79 MiB.
- Git whitespace check passed.

Public deployment and live verification are recorded in the pull request/task
after CI; these local results alone do not establish a live rollout.
