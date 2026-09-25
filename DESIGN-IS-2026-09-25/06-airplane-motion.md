# Airplane transition and richer motion

User direction: replace the eye scroll example with the airplane view and add
more motion. Preserve the repaired native scrolling, eased video playhead, fixed
header offset, mobile spacing, and reduced-motion behavior.

Keep the existing ink/iris/paper/mint palette and Space Grotesk/DM Sans type.
The motion should belong to the footage: source cards float independently, the
AI layer moves between them, the scroll chapter travels through window-shaped
frames, and the process/gallery panels open in perspective. Keep text and primary
actions stable. Looping motion pauses offscreen, in background tabs, and while a
film dialog is open; the page motion toggle stops it too.

Plan critique: extra generic particles would compete with the actual transition.
Use the airplane window and edit layers as the moving objects instead. Preserve
layout dimensions and limit drift to the existing clearance around each scene.

## Verification

- Chrome played the window-to-mountain scrub film and the matching full-example
  dialog. The lightweight 720p film has a keyframe every 0.5 seconds.
- Offscreen hero animations and all decorative loops behind the example dialog
  report paused; the motion toggle removes all animation names.
- At 650px, the floating output retained about 62px of clearance above the
  timeline. At 390px, the airplane scene and process panels remain readable.
- At 844 x 390, the stage is 318px tall below the 72px header, with the heading,
  control, and timeline fitting inside it.
- Reduced-motion emulation disables all loops and leaves background videos
  paused without media sources. Browser emulation was reset afterward.
- TypeScript, production build, whitespace checks, and all 194 deployment-asset
  checks passed. The existing scroll controller and provider/payment code were
  not changed.
