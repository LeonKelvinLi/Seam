# Current homepage evidence

All source paths below are relative to this checkout, HEAD aeff5d6.
Four bounded read-only agent reports cover structure, visual appearance,
copy/behavior, and weight/friction. The orchestrator owns scores and direction.

## Structure

- Six sections: hero, scroll example, process, gallery, FAQ, outro.
  CinematicHome.tsx:293-732. (All component references are under src/components.)
- 20 initial authored controls, excluding shared navigation: 7 buttons, 8 links,
  5 FAQ summaries. Conditional dialog adds four authored controls and video controls.
  TSX:298-309,323-334,397-403,431-436,503-508,527-529,624-626,641-680,698-711,728-730,773-819.
- Maximum lexical JSX depth 7, DOM depth 8 after Icon expansion (AST count).
  TSX:287,293,337,357,391,397,402.
- Three direct create CTAs plus one sample shortcut; six film-opening controls
  across four films; four free-preview messages. No unused imports/dead props found.
- Source/AI/destination explanation repeats in hero, timeline, scrub, process.
  TSX:363-429,514-518,588-620.

## Visual evidence

- Live Chrome extension at 1800×931: process section is #f0f1f6 and
  1800×1003.6 px at document Y3020.4–4024.0; 15.4% of a 6502px page.
  It fills the 859px visible area beneath navigation after selecting How it works.
  CSS:575-579. Other main sections are dark.
- Two process images have 6px white borders and white backgrounds; center card
  uses #d9d0fa to #b4a2e4. CSS:646-655,680-699.
- Hero media begins around Y636 in the inspected viewport, beneath copy/actions.
- Rendered type scale: 9,10,11,12,13,14,15,16,19,23,28,29,30,56,64,77,82,104,122px.
  CSS:85-118,591-638,701-715. Space Grotesk + DM Sans: app/layout.tsx:10-11.
- Positive spacing values: 3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,20,21,24,25,
  26,28,29,30,32,34,40,44,50,54,60,65,80,85,88,90,100,110,120,126px.
- Homepage CSS references 100 hex literals (46 opaque,54 alpha), versus five
  semantic palette variables. Whole CSS-file count, not rendered pixel count.
- Lowest measured primary/body uniform-background contrast 4.67:1 (#686b7c on
  #f0f1f6). Small AI caption gradient-endpoint contrast estimate 3.67–5.70:1;
  actual glyph minimum not measured. Video-frame contrast not certified.
- Loading/error/focus states exist (TSX:449-475,519-526,785-790; CSS:27-31).
  Scrub status lacks live announcement. Empty/success/disabled are not homepage
  transactions; corresponding app surfaces contain those states.

## Copy and actual media

- Headline identifies AI transitions between clips. TSX:313-315.
- Hero plays coffee video; scrub seeks real airplane video. TSX:94-130,181-203,449-475.
- Process middle plane is text/gradient, not transition footage. TSX:588-619.
- Gallery shows JPGs until opened, then genuine before/after MP4. TSX:645-684,777-785.
- Hero playhead is an independent 7.8s CSS animation, not actual playback time.
  CSS:1586-1598,1633-1634. Scrub ruler is synchronized correctly.
- “Creates the impossible move” and “An impossible move out” are aspirational
  claims (TSX:318-320,545-547). “Bridge” and “playhead” can be clearer as
  “transition” and “playback position”. TSX:488,582,683.
- “Watch the result” appears as plain text, separate from the actual play button.
  TSX:397-406. Process aria-label overstates the illustrative center plane, TSX:590.
- Pricing/credit refund statements match billing.ts:20,38 and generate-job.ts:365-369.
  Guest free trial has shared-network eligibility exceptions (free-runs.ts:1-35).
  No fabricated testimonials, urgency, subscription traps or stats found.

## Weight and friction

- Build-derived initial modern JS: 492,604 raw bytes, ~146,069 gzip bytes,
  nine external scripts. Parse .next/server/app/index.html:1 and sum referenced
  .next/static/chunks files. Excludes inline hydration and later loads. Not a
  measured live transfer figure.
- Live initial requests and time-to-interactive are UNKNOWN. Static HTML lists
  24 modern resource URLs, including lazy resources; not a request count.
- Source-inferred settled desktop hero: nine repeating CSS targets and one
  looping video. CSS:1605-1637, TSX:94-130. Not all necessarily visible on mobile.
- Offscreen, hidden-document, dialog-open and reduced-motion gating present.
  CSS:1499-1516,1639-1643; TSX:257-279.
- Initial notifications=0, modals=0. Signed-in navigation has one balance badge;
  guests have none. NavUser.tsx:30-32; TSX:255,733.

## Limits

Desktop visual evidence only; no new mobile or paid-generation audit. Source
claim checks are not live transaction proof. No user comprehension study or
competitor originality study was performed. Motion/contrast over every video
frame and actual performance remain unmeasured.
