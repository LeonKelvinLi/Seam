# Clipmelt UGC ad: research, concepts and production blueprint (2026-09-24)

This covers a vertical 9:16 ad of 20–30 s for TikTok, Reels, Facebook Reels and Shorts. The presenter is a HeyGen
Avatar V stock look: **Marcel, sitting in his living room** (look `046b2b11e4424b5c81f8d0223d3281d5`).

The proof is real Clipmelt output:
- The coaster → cartoon result (`data/ads/real/ugc_rails_full.mp4`).
- Skate → BMX (`data/live-results/one-trial`, quality 89).
- Cliff → surf (`data/live-results/fal-check3`, quality 89–91).

Labels used below: FACT = a number with a source. PATTERN = something seen across many examples. OPINION = an
expert or vendor claim.

---

## 1. Research findings that drive the decisions

**The first 3 seconds decide the ad**
- FACT: on Meta, the average hook rate is 24.4%, and 22.78% for software. About 3 in 4 impressions are gone
  before second 3 ([Billo 2026](https://billo.app/creative-insider/data-insights/hook-rate-benchmarks/)).
- FACT: TikTok's guidance is to state the proposition in the first 3 s, land the hook within 6 s, and show text at
  5–10 words/s ([TikTok Ads Help 2025](https://ads.tiktok.com/help/article/creative-best-practices)).
- FACT: over 63% of TikTok's highest-CTR ads show the product or message within 3 s
  ([TikTok creative tips](https://ads.tiktok.com/business/library/Auction_Ads_Creative_Tips.pdf)).
- FACT: hooks that open on the product or result averaged 2× the views of the weakest hook type
  ([OpusClip 2026](https://www.opus.pro/blog/anatomy-of-a-viral-tiktok-2026)).
- FACT: Reels that hook with **both a visual and a sound** were 1.5× more likely to reach the top 20% for purchase
  intent ([Meta/Toluna via BestMediaInfo 2025](https://bestmediainfo.com/insights/want-reels-ads-that-actually-work-meta-just-revealed-the-playbook-10866888)).
- OPINION: opening on a face with an introduction ("hey guys…") is the fastest way to lose people
  ([OpusClip 2026](https://www.opus.pro/blog/anatomy-of-a-viral-tiktok-2026);
  [Social Media Examiner 2025](https://www.socialmediaexaminer.com/how-to-create-short-form-video-content-that-stops-the-scroll/)).

**Where the presenter goes**
- FACT: when the talent's face covered less than 20% of the frame, CTR was 31% higher
  ([VidMob](https://vidblog.vidmob.com/blog/12-creative-insights-for-better-performing-tiktok-ads)).
- FACT: showing the product more than once made an ad 2.7× more likely to reach the top 20%. Keeping the brand on
  screen for no more than 25% of the runtime made it 4.8× more likely (Meta/Toluna 2025).
- PATTERN: SaaS UGC puts the presenter over a screen recording (green-screen or picture-in-picture) for the demo,
  shows a full-screen face only for the pain or confession beat, and shows the output full screen for the payoff
  ([example](https://www.tiktok.com/@ugcwithfawn/video/7545491540395724054)).
- FACT: tutorial and app-review formats earn 45% more installs per 1,000 impressions than testimonials
  ([AppsFlyer via RevenueCat](https://www.revenuecat.com/blog/growth/ugc-ads-apps)).

**Pacing and captions**
- FACT: 80.2% of viral-tier clips use burned-in captions, and 78.6% animate them. B-roll appears in only 6%
  ([OpusClip](https://www.opus.pro/blog/why-viral-tiktoks-use-captions)).
- FACT: voiceover at 4+ words/s gave +19% conversion rate. Music plus narration doubled conversion rate (VidMob).
- OPINION: bold sans-serif captions of 32pt or more in the upper-middle third, and no static shot held longer than
  3–5 s.
- FACT: Meta's Reels safe zone keeps text out of the top 14%, the bottom 20–35% and 6% on each side
  ([Billo](https://billo.app/blog/meta-ads-safe-zones/)).

**Length and loops**
- FACT: TikTok recommends 21–34 s for in-feed ads
  ([TikTok](https://ads.tiktok.com/business/library/Top_Tips_One_Pager_SMB.pdf)). Google recommends 10–30 s for
  action-focused Shorts ads ([Google Ads](https://support.google.com/google-ads/answer/16041697?hl=en)).
- FACT: TikTok counts finishing a video as a strong signal. YouTube counts every replay as a view (since March
  2025). A last frame that flows back into the first earns replays.

**AI avatars: what looks natural and what's allowed**
- PATTERN: the giveaways are the eyes and lip-sync. On a 6 s hook almost anything passes; past about 20 s, eye and
  mouth drift appears. Two of five renders of the same script had an uncanny pause
  ([CrePal 2026](https://crepal.ai/blog/aivideo/best-ai-avatar-tools-ugc-product-ads/)).
  **So: 3–7 s bursts, and the avatar on screen for at most ~40% of the runtime.**
- FACT (HeyGen):
  - Custom motion is capped at 10 s.
  - For Avatar V, keep "More Expressive Motion" on and skip custom prompts.
  - Flat audio gives a static avatar.
  - Write the way people talk: short sentences, contractions, commas and ellipses for pauses, about 150 words a
    minute.
  - Sources: [HeyGen help](https://help.heygen.com/en/articles/14602997),
    [HeyGen FAQ](https://help.heygen.com/en/articles/15544929).
- FACT: viewers penalise AI ads.
  - Over 30% say they're less likely to choose a brand with AI-generated ads
    ([Hootsuite 2026](https://blog.hootsuite.com/social-media-trends/)).
  - 39% react negatively to AI ads (Tracksuit, 6,000 US consumers).
  - Disclosing AI in display ads cut CTR by 31.5%
    ([NYU Stern 2025](https://www.stern.nyu.edu/experience-stern/faculty-research/ai-advertising-paradox)).
  - OPINION: for an **AI tool**, the audience is shopping for AI. The larger risk is hiding the avatar and getting
    called out in the comments.
- FACT (compliance):
  - TikTok requires the AIGC label or your own clear disclaimer
    ([TikTok ads policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-misleading-and-false-content)), and
    bans misleading before/after.
  - Meta adds "AI info" next to Sponsored.
  - YouTube requires a synthetic-content disclosure and lists "made it appear someone gave advice they did not
    give" as an example.
  - The FTC rule (16 CFR 465) bans testimonials that misrepresent that a person exists or used the product. Penalty:
    up to $51,744 per violation ([FTC 2024](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)).
  - EU AI Act Art. 50(4) requires deepfake disclosure from 2 Aug 2026.
- **So the presenter is a host, never a customer.** No "I used this", no hours they spent. Label the avatar on
  screen and in the platform toggle.
- Backlash lesson: Higgsfield was exposed for passing stock footage off as AI output
  ([Product Growth 2026](https://www.productgrowth.blog/p/higgsfield-growth-teardown)). **Every transition we show
  must be real Clipmelt output.**

**How AI-tool demos spread**
- PATTERN: the result comes first, then how it was made (Pika effects, Runway Aleph input/output pairs).
- PATTERN: "Real or AI?" guessing is an established engagement format.
- FACT: reply-to-comment openers hook viewers (TikTok Spark playbook). **We only use them for real comments.**
- FACT: partnership ads run from creator handles beat licensed UGC run from the brand account: +19% CTR and −5% CPA
  ([Agentio 2026](https://www.netinfluencer.com/meta-partnership-ads-outperform-licensed-ugc-across-130m-usd-in-ad-spend-report-finds/)).
- FACT: only about 5% of creatives become winners
  ([Motion 2026](https://motionapp.com/library/research/creative-benchmarks-2026/)). **Test many hooks on one body.**

---

## 2. Twelve different concepts

| # | Concept | Structure | Presenter | Emotional angle |
|---|---|---|---|---|
| 1 | **Spot the AI** | Result plays → "one part of this is AI, when?" → slow-motion reveal with a REAL/AI scrub bar | Hidden, then PiP | Game / curiosity |
| 2 | **Keyframe graveyard** | Opens on a crowded After Effects–style timeline (recreated, no Adobe UI) → hard cut to "or… two clips" → result | Full screen for the "or" line | Relief / contrast |
| 3 | **Even the presenter is AI** | Marcel talks, then Clipmelt morphs *his* shot into the coaster → "yes, I'm AI too, but the clips are real" | Full screen, then transformed | Surprise; disclosure becomes the hook |
| 4 | **Reply to a real comment** | "Comment: no way that's not After Effects" → breakdown | PiP | Proof vs skeptic (**only after a real comment exists**) |
| 5 | **Nothing in common (series)** | "Least related clips you've got?" → coaster + cartoon → result; episode format | Full-screen bookends | Dare / series habit |
| 6 | **POV: transition due tonight** | POV text over a real app screen recording, no presenter | None | Relatable deadline |
| 7 | **Speedrun** | A real on-screen timer from upload to result (a real 60-odd-second run, sped up with the clock visible) | PiP narrates | Speed proof |
| 8 | **Frame-by-frame autopsy** | Presenter as forensic host: "let's find where the real footage ends" → scrub, zoom, freeze frames | PiP + full-screen close | Nerdy / educational |
| 9 | **Silent split-screen ASMR** | Two inputs side by side merge into one; text only; sound design carries it | None | Satisfying |
| 10 | **Host reacts (green screen)** | Presenter cut out in front of the result, reacting: "wait… watch the rails" | Green-screen overlay | Awe / reaction |
| 11 | **Comment keyword** | "Comment RAILS and we'll send the two clips" → organic Instagram DM funnel | PiP | Reciprocity (needs DM automation) |
| 12 | **Only 2 seconds are AI** | Factual opening claim → viewer hunts for it → reveal → more proof → CTA | Hidden, then PiP, then full-screen CTA | Credibility + curiosity |

## 3. Self-judgement (1–5 per criterion)

Columns: 1 scroll-stop · 2 first-3 s retention · 3 curiosity · 4 visual movement · 5 credibility · 6 organic feel
· 7 product clarity · 8 demo strength · 9 stays for payoff · 10 CTA potential.

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | **Σ** | Main weakness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Spot the AI | 4 | 4 | 5 | 5 | 4 | 4 | 3 | 4 | 5 | 3 | **41** | Doesn't show *how* you use it |
| 2 Keyframe graveyard | 3 | 3 | 3 | 3 | 3 | 3 | 4 | 3 | 3 | 4 | **32** | Opens on software pain, not the result; risks looking like an Adobe attack ad |
| 3 Presenter is AI | 5 | 5 | 4 | 5 | 4 | 3 | 3 | 4 | 4 | 3 | **40** | Needs an extra generation; the twist overshadows the product |
| 4 Real comment reply | 4 | 4 | 4 | 4 | 5 | 5 | 3 | 4 | 4 | 3 | 40 | **Can't run yet** (no real comment) |
| 5 Nothing in common | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 3 | 3 | **37** | Setup is slow before the result |
| 6 POV deadline | 3 | 3 | 2 | 3 | 4 | 5 | 5 | 3 | 3 | 4 | **35** | Low spectacle |
| 7 Speedrun | 3 | 3 | 3 | 3 | 5 | 4 | 5 | 5 | 3 | 5 | **39** | A timer isn't a thumb-stopper |
| 8 Autopsy | 3 | 3 | 4 | 4 | 5 | 4 | 3 | 5 | 4 | 3 | **38** | Slow; too nerdy for cold traffic |
| 9 Silent ASMR | 4 | 4 | 3 | 5 | 3 | 3 | 2 | 3 | 3 | 2 | **32** | No product clarity; no reason to act |
| 10 Host reacts | 3 | 3 | 3 | 3 | 2 | 2 | 3 | 3 | 3 | 3 | **28** | An AI "reacting" feels fake (a reaction is an experience claim) |
| 11 Comment keyword | 3 | 3 | 3 | 3 | 4 | 5 | 3 | 3 | 3 | 5 | **35** | Organic IG only; needs automation |
| 12 Only 2 s are AI | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 4 | 5 | 3 | **44** | Weak on product clarity and CTA |

**What the scores say:** #12 wins because its hook is a specific, *true* number that sets up a hunt, and
the answer proves the value proposition. #1 is its general form. #7 and the app screen recording fix
the shared weakness (clarity: "what do I actually do?"). #3's disclosure twist is strong but costly, so it becomes a
**hook variant to test**, not the main ad. #2 is useful as a 1.5 s pain flash inside the ad, not as the opening. #10 is dropped
(an AI presenter "reacting" is an implied experience claim).

## 4. Iterations

**v1 = #12 alone.** Claim → hunt → slow-motion reveal → CTA (18 s).
Critique: viewers learn it's impressive but not *what Clipmelt is*. It shows the output once (research says 3+
times). There's no pain, so there's no reason to switch. The CTA is weak.

**v2 = #12 + #7 + #2 flash + two more results.** Added:
- A 3 s real phone screen recording (drop two clips → pick → result).
- A 1.5 s keyframe-timeline flash for the pain.
- Skate → BMX and cliff → surf back to back.

Critique: 31 s is too long, and the pain flash in the middle breaks the momentum. The presenter is on screen 45% of
the time. The screen recording and the two extra results compete.

**v3 = final.** Changes from v2:
- Pain moves *into the presenter's first line*, over the timeline flash, so it doubles as the first pattern
  interrupt.
- The two extra results are cut to 1.6 s each and serve as the rhythm for the CTA section.
- The screen recording shrinks to 2.5 s.
- The presenter drops to about 30% of the runtime, never full screen for more than 4.5 s.
- The ending morphs back into the opening frame for a loop.
- Result: 24 s, the output shown 4 times, a hook with a sound hit, a claim that is true, and a label that stays out
  of the way.

---

## 5. Final concept: "Only 2 seconds of this are AI"

**One-line idea:** the ad dares you to find the AI part of a clip that's mostly real footage, reveals it in slow
motion, then shows how simple it was to make and how to try it free.

**Claims check (before publishing):**
- "2 seconds": every live Clipmelt run we measured produced a **2.03 s bridge** (4 of 4 runs on 2026-09-24).
  **Confirm the bridge length on the generation page for `gen_xw1hjns0edag` before posting.** If it differs, change
  the number in the hook.
- "No keyframes, no masks, no tracking": true. The app generates the shot with no manual animation.
- "Your first one's free": true (1 free transition, no signup).
- "About a minute": true for the measured run (62 s click to ready). Runs that fall back to Kling took about 3.3 min,
  so the line says "minutes", not "a minute".
- The presenter never claims to have used the product.

**Rights check:**
- Skate, BMX, cliff and surf are Pexels footage (commercial use allowed, no endorsement implied).
- **Confirm you own or licensed the coaster POV and the animated subway story before paid use.** Until then this
  runs organically only, or we swap in the cliff → surf result for the hook.

### Exact script (Marcel, Avatar V, one take, about 58 words)

> [1] Normally… this means keyframes, masks, and motion tracking.
> [2] This one took minutes. Nobody touched a timeline.
> [3] Real coaster. Real cartoon. And only *this* part… is AI.
> [4] You drop in two clips. Clipmelt finds what they share, and makes the shot in between.
> [5] Two clips in… one shot out. Your first one's free.

Write it with commas and ellipses exactly as shown (HeyGen reads them as pauses). Keep Expressive Motion on and add
no motion prompt. Render **one** take (about 20 s) so the voice stays continuous; the edit uses only 3–7 s of face at
a time.

### Second-by-second timeline (24.0 s, 1080×1920, 30 fps)

Safe zone: keep text and faces within y 270–1250 px (clear of the top 14% and bottom 35%) and x 65–1015 px.
Captions: bold sans, 56–64 px, white box, 1–2 words highlighted in lime, upper-middle third (centre y about 470).
Presenter PiP: bottom-left, 300×400 px at x 65, y 840 (under 7% of the frame), 24 px corners, and a small
"AI avatar" tag on the PiP's top edge.

| Time | Visual | Presenter | On-screen text | Audio | Why it holds attention |
|---|---|---|---|---|---|
| **0.0–0.4** | Coaster clip, already mid-drop (source 6.9 s), full screen, slight punch-in | Hidden | **"Only 2 seconds of this are AI."** | Hit + riser starts; real coaster wind | Specific, checkable claim with a sound-and-image hook |
| 0.4–2.6 | Keeps playing into the dive; the AI rails morph happens around 0.9–2.3 s | Hidden | Second line: **"find them 👀"** | Whoosh at the morph | Payoff lands in the first 3 s; viewers start hunting |
| 2.6–3.4 | The cartoon lands; freeze frame, 1.08× zoom | Hidden | "…did you?" | Record scratch / tape stop | Pattern interrupt; the question keeps the hunt open |
| **3.4–7.6** | **Keyframe-graveyard flash** (0.8 s, recreated timeline, hundreds of diamonds) → cut to the presenter | **Full screen** 3.6–7.6 (4.0 s) | Caption follows the speech: "keyframes · masks · motion tracking" crossed out, then "minutes" | VO [1]+[2]; music bed drops in | Pain, then relief; a new face is interrupt #2 |
| **7.6–13.2** | **Rewind** (0.4 s blur) → 0.3× slow motion of the join with a REAL \| AI \| REAL scrub bar and timecode | **PiP** | Chips: "REAL CLIP 1" → lime "AI · 2 s" → "REAL CLIP 2"; caption "only this part… is AI" | VO [3]; muffled music, tape rewind SFX, sub hit when the AI chip lights | The reveal pays off the hook; the scrub bar gives proof |
| **13.2–16.4** | **Real phone screen recording** of clipmelt.com: drop two clips → recommendations → result (sped up, real clock visible) | **PiP** | "drop 2 clips" → "pick" → "done" | VO [4]; taps on each step | Product clarity: what you actually do |
| 16.4–19.6 | **Two more real results**, 1.6 s each: skate → BMX, cliff → surf, with REAL/AI chips | Hidden | "any 2 clips" | Two whooshes on the morphs | Output shown 3rd and 4th time; momentum |
| **19.6–22.8** | Presenter | **Full screen** (3.2 s) | "Two clips in. One shot out." → **"1st one free · clipmelt.com"** URL pill | VO [5]; music peak | Direct CTA from a face; one idea only |
| 22.8–24.0 | End card: mark + URL pill, then the frame dissolves into the coaster mid-drop (the ad's first frame) | Hidden | "clipmelt.com" | Sting; the riser from 0.0 s starts again | Loop: a replay counts, and the second viewing hunts the AI again |

Presenter screen share: full screen 7.2 s + PiP 8.8 s at under 7% of the frame. The large face is on screen 30% of
the runtime, and no single face shot runs longer than 4.0 s.
Output shown: 4 times (hook, slow-motion, screen recording, the two extra results).
Brand on screen: URL pill 19.6–24 s plus the small PiP tag, under 25%.

### Disclosure

- A small "AI avatar" tag on every presenter shot, 22 px mono in a lime-outlined pill.
- The post caption starts with: "Presenter is an AI avatar. Every transition shown is real Clipmelt output."
- Turn on TikTok's AI-generated content toggle, Meta's AI label and YouTube's "altered or synthetic content".

### Hooks to test on the same body (swap only 0–3.4 s)

1. **"Only 2 seconds of this are AI."** (main)
2. "Find the exact second this stops being real."
3. "A roller coaster and a cartoon have nothing in common. Watch." (the "nothing in common" dare)
4. Presenter-first twist (#3): Marcel's own shot morphs into the coaster, with the caption "yes, the presenter is AI
   too. The clips aren't." This needs one extra Clipmelt generation from his last frame.
5. Text-only calm version: split-screen inputs → merge, with the caption "no keyframes, no masks, no tracking."

**Cutdown (15 s):** 0–3.4 hook, 7.6–11.6 slow motion (VO [3]), 16.4–18.0 one extra result, 19.6–22.8 CTA,
22.8–24.0 end card.

### Production steps and costs

1. **HeyGen:** the API wallet has **$0.55** with auto-reload off. Run a 3 s test line first to measure the real price
   per second, then render the full ~20 s take. **You'll need to top up the API wallet** (HeyGen dashboard →
   API → billing; the web-plan credits are separate).
2. **Screen recording:** a real clipmelt.com run captured in a phone viewport with the headless recorder. It uses
   one free run, about $0.13–0.60 in fal fees.
3. **Keyframe timeline:** recreate it in the motion renderer. No Adobe logos or UI copy; generic diamonds and
   bezier mask paths only.
4. **Assembly:** a new `ugc-host` timeline in `scripts/motion` (PiP layer and HeyGen audio as the voice track;
   music ducked −10 dB under the voice), built on the existing breakdown timeline.
5. **QA:**
   - Check eye and lip drift in every avatar shot (re-render the take if a shot fails; research found 2 in 5 renders
     had an uncanny pause).
   - Check captions against the safe zone and loudness at −13 LUFS.
   - Watch it muted: the captions alone must carry the story.

### What to measure

| Metric | Target | Meaning |
|---|---|---|
| Hook rate (3 s views ÷ impressions) | ≥ 30% | Beats the 22.8% software average |
| Hold to 15 s | ≥ 40% | |
| Rewatch / average watch time | > 85% | Means people are looping |
| Comments | | Count "is this AI" / "where's the AI part" comments. These fuel reply-to-comment follow-ups (#4) once they're real. |
| Downstream | | Visits → uploads → generations by `utm_content` per hook (tracked since d2298c5) |
