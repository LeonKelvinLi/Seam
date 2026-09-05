# Reference study: transition grammar from real edits

Source: visual walkthrough of https://www.youtube.com/watch?v=kAqB8LesTns (vidIQ video analysis, 2026-09-05).
The Rumble reference (Tate Confidential ep. 344) could not be fetched: none of the connected analysis tools accept Rumble URLs
(Higgsfield's analyzer takes YouTube or uploaded files; vidIQ is YouTube only). Download it locally and upload it to
Higgsfield's video analysis to add it to this study.

## Breakdown (YouTube reference)

| Time | Technique | Motivated by | Reads as | Notes |
|------|-----------|--------------|----------|-------|
| 00:20 | Match cut across textures with a typographic anchor | beat + typographic continuity | intentional | static macro (rain on ivy) into kinetic street; a person crossing catches the eye immediately |
| 01:19–01:46 | Fade to black → title → in-camera blind-raise reveal | location + mood change | cinematic, noticeable | motorised blinds act as a physical wipe; mechanical hum grounds it |
| 01:51–02:34 | Action-matched jump cuts + object inserts (1–2.5 s each) | body movement, vector matching | rhythmic | arm reaching leads to wrist turn; cardigan swing points the eye into the next shot |
| 05:39–05:54 | Walk into shadow → title card → exterior wide | narrative scene change | invisible exit | subject's walk into darkness carries the gaze off screen; dialogue cut sharp to silence, sub impact under the quote |
| 06:03–06:10 | Whip pan into a static hero shot (8–12 frames) | music drop, vehicle intro | noticeable | left-to-right blur into a dead-centre static frame; air-displacement riser |
| 06:10–07:34 | Apex-of-rep match cuts (0.8–2 s) | repetition cadence | high energy | cut at the top/bottom of the movement so momentum carries vertically |
| 09:47–10:41 | Ambient b-roll → detail push → environment transformation | spatial journey | invisible, fluid | wet glass macro works as a perceptual wipe; a street lamp turning on luminance-matches the lit liquor shelves inside |
| 11:13–11:47 | Prop-action match cuts (cigar, cutter, match strike) | synchronous action + light | fluid | the flame burst is a high-contrast point of interest that masks angle changes |
| 14:04–14:18 | Macro dissolve → black → workspace | structural act break | intentional | 2 s fade, lounge music under the quote, room tone after |

## Patterns worth copying

- **Luminance matching**: cut from a light turning on to a lit interior; exposure links unrelated spaces.
- **Kinetic apex cuts**: cut on the top or bottom of a movement so the next shot inherits momentum.
- **Micro-inserts**: 2–3 s macro details reset attention inside long talking sections.
- **Walk into darkness / object covers lens**: natural occluders make invisible cuts.
- **Textural wipes**: a wet window or steam in the foreground is a free wipe.
- **Sound sells it**: whoosh/riser into a whip, mechanical foley on physical reveals, hard silence before an impact.

## Impressive but easy to overuse

- Large in-camera or generated wipes (blinds, portals, fly-throughs): once per video as an act break.
- Whip pans into static objects: only when the next shot carries equal energy.
- Any transformation transition when nothing in the frame motivates it.

## Where a hard cut wins

- Dialogue and conversation: cut on conversational rhythm, over-the-shoulder, no effects.
- Rapid montages: the rhythm is the transition.

## How this is encoded in Seam

`src/core/director/grammar.ts` detects motivations (camera/subject movement, direction, zoom, object passing the frame,
lighting change, location change, composition/shape/colour match, plus beat/dialogue hooks), scores how strongly each recipe
is earned, penalises unmotivated flashy moves, caps intensity under dialogue, and promotes a *Clean Cut* when nothing
motivates more. Every recipe carries a sound-design suggestion (`sound`) in the same spirit as the reference's whooshes,
risers and foley.
