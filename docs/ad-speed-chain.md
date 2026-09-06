# Ad: "Speed chain" — 5 clips, 0 cuts (final reference cut, 2026-09-06)

Output: `public/ads/speed-chain-final.mp4` (1080x1920, 15.7 s). Spec: `data/ads/speed-chain-final.json`. Renderer: `scripts/render-ads.ts`.
Bridges are 4–5 s generations played at 3.5x (about 1.1–1.5 s each). Earlier variants: `speed-chain.mp4` (5x), `speed-chain-slow.mp4` (2.5x).
Rights: built from publicly posted creator clips downloaded for reference. Not cleared for paid distribution.

## Timeline
| t (s) | Segment | Source | Notes |
|---|---|---|---|
| 0.0–2.5 | Speed countdown → backflip fail | YouTube Q9cAPbIwkkI 25.2–27.7 s, Higgsfield upscale 480p→1080p | hook, original audio |
| 2.5–3.6 | Bridge A: street cracks → freefall → crane platform | Higgsfield Wan 3.0, 4 s at 3.5x | endpoints exact |
| 3.6–5.9 | Adin Ross crane jump → airbag | TikTok 7509255792789409046 9.5–11.7 s, caption cropped | original audio |
| 5.9–7.3 | Bridge B: airbag fabric → dark → scream | Higgsfield MiniMax H3 Max, 5.2 s at 3.5x | holds the real frame, identity close |
| 7.3–8.8 | Speed scream | YouTube 7PMrxmtFPKg 8.5–10.0 s, upscaled, face-cam with blurred fill | original audio |
| 8.8–10.3 | Bridge C: into the mouth → tunnel → headlights → wheel | MiniMax H3 Max, 5.2 s at 3.5x | snap-zoom start |
| 10.3–11.3 | Car wheel (generated plate, last second) | Seam demo footage | cleared |
| 11.3–12.4 | Bridge D: wheel → tunnel | PixVerse V6 via OpenArt, 2 s at 1.75x | cleared |
| 12.4–13.4 | Tunnel (generated plate) | Seam demo footage | cleared |
| 13.4–15.7 | End card "Connect literally anything." | rendered | |

## Bridge scores (30% seamless, 25% wow, 15% originality, 15% motion, 10% endpoint, 5% visual)
| Bridge | Seamless | Wow | Orig | Motion | Endpoint | Visual | WOW |
|---|---|---|---|---|---|---|---|
| A crash → freefall | 8 | 8 | 7 | 8 | 9 | 6 | 7.9 |
| B airbag → scream (MiniMax) | 8 | 6 | 6 | 7 | 8 | 7 | 7.0 |
| C scream → wheel (MiniMax) | 7 | 8 | 8 | 8 | 8 | 7 | 7.7 |
| D wheel → tunnel | 8 | 6 | 5 | 8 | 9 | 7 | 7.1 |

Rejected: Wan versions of B and C (identity swap after frame one), Kai → roller coaster (identity swap), scream → wheel v1 (letterbox pop).

## Ad scores (cold viewer / editor / marketer)
hook 8 · humor 6 · retention 7 · pacing 7 · editing 7 · visual 6 · shareability 6 · comment potential 7 · rewatch 7 · overall 7
Strongest: 0–3.6 s (countdown, flip, ground cracks, freefall). Weakest: 8.8–9.2 s (bridge C starts as a snap zoom rather than a push).

## What would move it from 7 to 8+
1. A real music bed with a drop on bridge A; the synthesized cues are placeholders.
2. Regenerate C with an explicit "hold the face for one second, then push" on a 5 s MiniMax run at 1080p, or split it into two bridges (mouth → tunnel, tunnel → wheel).
3. Replace the Adin clip with a version without the airbag sponsor branding, or license it.
4. Subtitle the scream ("AAAAH") and the countdown in Seam's own style so the baked source captions can be cropped out entirely.
5. For paid use: recreate the three creator moments (or license them) and keep the same bridge prompts; the plates and end card are already cleared.

## Smoothness iteration log (2026-09-06)

Goal: seams that do not read as transitions. Judge = eight consecutive frames around every seam at 30 fps, plus a 4 fps strip.

| Round | Change | Result | Verdict |
|---|---|---|---|
| r1 | Bridges speed-ramped (14% head and tail at 1.4x, middle at 6x) instead of constant 3.5x; 0.13 s video+audio blend at every seam; unsharp on bridges; uniform film grain (noise 5) | No visible freeze at bridge starts; exposure and sharpness pops gone; grain unifies phone footage and AI frames | 7/8 seams invisible, airbag → scream still a soft identity shift |
| r2 | Context captions on clips only: premise up top ("5 random clips. 0 cuts."), then "Speed tries a backflip", "Adin's 100ft crane jump", "Speed screaming", "A car.", "A tunnel." | Cold viewer can follow the chain; captions never sit on a bridge | same seams as r1 |
| r3 | Seam blend 0.15 s; airbag → scream ramp softened (1.15x edges, longer tail); scream → wheel middle 6x → 5x | Airbag → scream is a gradual five-frame shift; mouth → tunnel → car beat readable | good: all seams frame-continuous |

Scores after r3 (30% seamless, 25% wow, 15% originality, 15% motion, 10% endpoint, 5% visual):
A crash → freefall 8.3 · B airbag → scream 7.6 · C scream → wheel 8.0 · D wheel → tunnel 7.4. Ad overall 7.5.

Still open: a real music bed; bridge B is the least surprising idea (fabric → dark room); for paid use recreate or license the three creator moments.
Renderer features added this round live in `scripts/render-ads.ts`: `ramp`, `sharpen`, `xfadeSec`, `grain`.

## Round 4 — real plates (2026-09-06)

Principle: Seam sells the transition, not generated footage, so every non-bridge shot is real. The generated car-wheel and
tunnel plates were replaced with 4K stock under the Pexels license (commercial use, no attribution required):
`pexels.com/video/13891268` (car tyre in rain) and `pexels.com/video/33938671` (illuminated tunnel at night, 15.0–16.2 s).
Bridges C and D were regenerated on MiniMax H3 Max from the real plates' exact frames. Output: `public/ads/speed-chain-real.mp4` (16.6 s).

| Bridge | Seamless | Wow | Orig | Motion | Endpoint | Visual | WOW |
|---|---|---|---|---|---|---|---|
| A crash → freefall | 9 | 8 | 7 | 8 | 9 | 6 | 8.3 |
| B airbag → scream | 8 | 6 | 6 | 7 | 8 | 7 | 7.0 |
| C scream → mouth → wet street → real wheel | 8 | 8 | 8 | 8 | 9 | 8 | 8.2 |
| D real wheel → hub → tunnel | 9 | 7 | 8 | 9 | 9 | 8 | 8.4 |

Three of four bridges clear the 8.0 hero bar. B remains the weak idea, not a technical failure.
Raw stock is in `data/viral/stock/`; plates in `data/ads/wheel_real.mp4`, `data/ads/tunnel_real.mp4`.

Rights status: the three creator moments (Speed backflip, Adin crane jump, Speed scream) are still reference-only.
The plates, bridges, sound and end card are cleared.

## Round 5 — brand + CTA (2026-09-06)

Goal: make the end card feel less "AI generic" and put the real SeamCut mark on it.

- Logo: the mark was cropped from the SeamCut poster (`data/brand/poster.png` → `data/brand/mark.png`), upscaled to 4K on Higgsfield (bytedance image upscale → `data/brand/mark_4k.png`), background-removed (`data/brand/mark_cutout_raw.png`), then trimmed, squared and padded into `public/brand/seamcut-mark-cutout.png` and `seamcut-mark-{256,1024,2048}.png` (transparent, checked on dark and light). The 256 px version is the app favicon and nav mark. A 4K wordmark upscale was submitted (Higgsfield job `55e825c1-1370-4455-9a96-fdcb582fb91f`); `public/brand/seamcut-lockup.png` remains the vector-based fallback lockup.
- End card: no synthetic gradient any more. It is composited over the blurred last frame of the real tunnel plate (`gblur=22`, brightness −0.18, contrast 1.08, 38% black wash) so the tunnel texture stays visible behind the copy. Layout: mark (260 px) → "SeamCut" → "Same story. Better transitions." → "Real footage. Real results." → yellow pill "Try SeamCut →" → "CREATE · CUT · CONNECT". 2.6 s hold with a slow push-in; the seam from the tunnel plate is a 0.15 s blend like every other seam.
- Output: `public/ads/speed-chain-seamcut.mp4` (17.0 s, 1080×1920, 30 fps). Timeline unchanged from round 4 up to 14.4 s.
- Verified: `data/ads-tmp/endcard_v2.jpg` (frame at 14.9 s), `npm run typecheck` clean after the layout/favicon changes.
- Spend: two Higgsfield image jobs (upscale + background removal) plus the pending wordmark upscale; no video credits.

## Round 6 — slower bridges, serif outro, outro self-judgment (2026-09-06)

Brief: "make the transitions slightly slower", then "outro: self judge and improve" against a reference card (serif wordmark, gold accent line, tracked caps, desk scene).

- Bridges: mid-section speed lowered on every AI bridge (A 6.0→5.0, B 6.5→5.5, C 5.0→4.2, D 5.0→4.2; edge speeds 1.4/1.15/1.3/1.3 → 1.3/1.1/1.2/1.2). Bridge screen time 0.82/1.04/1.21/1.20 s → 0.96/1.19/1.41/1.40 s. SFX hits retimed proportionally. Endpoints unchanged, so every seam stays frame-continuous (checked with one 7-frame tile per seam; the first sheet was wrong because `-frames:v 7` after `tile=7x1` keeps the seventh tile, not the first).
- Outro judgment of the reference: strong type hierarchy (Didone wordmark, ivory/gold headline split, tracked caps, gold pill) and an editor's-desk context that says who this is for. Weak points: the background is an AI render (contradicts "Real footage. Real results."), the mark is small for phone viewing, the source is under 1080 px, and a flat card lands abruptly after a bright tunnel.
- Outro rebuild (`endCardSerif` in scripts/render-ads.ts): crisp SVG type at 1080×1920 (Didot 700 wordmark 150 px, Didot 400 headline 92 px with the second line in gold #e3c079, Helvetica Neue tracked caps for sub/pill/footer), real mark at 200 px, over a real Pexels clip (video 29267591, editor in a dark studio, from 4.0 s; blur 2, dim 0.10, warm colorbalance, vignette, 36% radial wash). Type fades up over 0.7 s. The outro lands through its own 0.6 s dissolve (`endCard.fadeSec`) instead of the 0.15 s action blend, with a soft sub hit at the landing.
- Output: `public/ads/speed-chain-seamcut.mp4`, 17.56 s; outro starts at 14.77 s. Previous cut kept as `speed-chain-seamcut-r5.mp4`.
- Frontend pass for deploy: 24/24 tests, `next build` clean, deploy asset manifest verified, nav/footer now use the real mark + "SeamCut", mobile hero copy spacing fixed.
