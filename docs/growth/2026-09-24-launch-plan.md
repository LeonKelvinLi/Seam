# Clipmelt launch plan: growth, distribution and sales research (2026-09-24)

Labels: **FACT** means verified directly (live site, repo, Stripe, a source). **HYPOTHESIS** means supported by evidence but unproven for Clipmelt. **EXPERIMENT** means we have to test it. Sources are linked inline and listed at the end.

---

## 1. Executive summary

- **Traffic would currently land on a broken first run.** FACT: on 2026-09-24 at 04:28 UTC I ran one new-guest, real-footage transition (cliff clip + surf clip) on clipmelt.com.
  - Upload and analysis took about 50 s.
  - The generation **failed after about 9.5 minutes**. The two best-rated models (MiniMax H3 and Kling on fal) failed instantly because *"User is locked. Reason: Exhausted balance"*.
  - The fallback, Higgsfield DoP, ran 192 s and then 382 s, and both results were rejected (quality 48 and 39 against a pass mark of 80).
  - The credits were refunded, but the visitor waited ten minutes for nothing. **Fix this before any growth work.**
- **The wedge is not "AI video".** It isn't even "AI transitions from two frames", which VEED, aitransitions.app, FlexClip, Imgveo and others already ship.
  - Clipmelt's defensible angle: **keep your real footage; Clipmelt picks and generates only the shot in between, checks its quality, and hands back one finished clip.** No editor, no prompting, pay per use.
  - It only wins if the first result is good and fast.
- **Every fast-growing tool in this space got first traction the same way.** Each shipped one named, repeatable visual effect that viewers wanted to copy, then let creators spread it: Pikaffects "Squish it", PixVerse "Venom", Viggle's "Lil Yachty walkout" template, Higgsfield's camera presets and one-click effects. Clipmelt should do the same with 3 named transitions, not a 49-style catalog.
- **Creators beat ads at this stage.** Submagic reached $1M ARR in 3 months on a 30% lifetime affiliate program with 50–70 young TikTok creators. Higgsfield's pay-per-view creator program produced 3B+ impressions, but also its February 2026 reputation crisis.
  - Copy Submagic's structure (a lifetime revenue share tied to real paying users).
  - Avoid Higgsfield's (payment per view, which rewards shock content).
- **The new 21.6 s ad** looks good but is built like a showreel.
  - Its first second is nearly static and nearly silent.
  - Nothing explains the product between 1.5 s and 16 s.
  - The CTA arrives at 19.4 s.
  - Re-cut it into 6–13 s variants that open on the transformation and say "the clips are real, the in-between is AI" in the first 2 s.
- **Measurement is half there.** Server-side product events exist (uploads, analysis, generations, downloads, shares, signups). Missing: visit/UTM/referrer attribution, CTA clicks, checkout-started, purchase events, creator codes. About 2–3 hours of work.
- **The free offer and pricing are near break-even under full usage.** A preview costs about $0.36–0.42 (the repo's own estimate). Packs sell a preview for $0.60 (Starter), $0.48 (Pro) and $0.45 (Studio). A person can currently get up to 6 free previews (3 as a guest plus 3 on signup).
  - Tighten this to 1 instant free preview, plus 2 more after Google sign-in.
  - Put the price in front of people only after they've seen a real result.

---

## 2. What Clipmelt actually sells

FACT (live product and repository):

- **Workflow:** open `/create` → drop a start clip and an end clip (MP4/MOV/WEBM or images, mobile web works) → the app finds the last frame of A and the first frame of B → an AI analysis writes a pair-specific recommendation. The live example read: *"Both shots live in the same cool green water world… Green Fills the Frame — Because a shared palette. The cut you cannot see."* → the user picks a style, from a library of 49 recipes → the router generates the bridge across several models, with a quality judge and retries → A + bridge + B are exported as one clip, with a share page.
- **Pricing** (`src/lib/server/billing.ts`):
  - A preview costs 2 credits and a final render costs 6.
  - Packs: Starter $9 / 30 credits, Pro $29 / 120, Studio $89 / 400. Credits never expire, and there's no subscription.
  - Checkout is through three live Stripe Payment Links, with a signed webhook.
- **Free trial:** 6 credits (3 previews) for every **guest**, no signup needed. An account created later gets its own 6 (`src/db/repo.ts`). New guests are capped at 10 per IP per day (in-memory, reset on deploy).
- **Sign-in:** Google OAuth works on clipmelt.com (verified: the redirect URI and Google's sign-in page are fine). Email and password also work, with confirmation and reset.
- **Money:** your $9 test charge was real and succeeded, and the webhook was delivered. Stripe took $0.56, leaving **$8.44 net**. It's pending in the BEASTY LLC Stripe balance, available on 2026-09-26, and payouts run daily with a 2-day delay to the bank account linked in the Stripe dashboard.
- **Time-to-value:** measured at 10 s upload + ~40 s analysis + the generation. Best case, per the live router's own stats: MiniMax H3 ≈ 46 s at 60% acceptance, Kling 2.1 ≈ 145 s at 78%, so about 2 minutes. What we actually measured today: a failure after about 9.5 minutes.

**What it sells, in one line:** *"The shot between your shots."* The creator keeps their real footage, and Clipmelt makes the impossible connection between two clips.

**Why use Clipmelt instead of the alternatives** (HYPOTHESIS until tested):

| Alternative | What it does for transitions | Clipmelt's honest edge | Clipmelt's weakness |
|---|---|---|---|
| CapCut templates | Canned zoom, whip and glitch transitions; free; huge template ecosystem ([CapCut templates](https://www.capcut.com/template/effects/loop-transitions)) | Generates a new, scene-aware shot (the lagoon becomes the wave) that templates can't | CapCut is free and already on everyone's phone |
| Premiere / After Effects | Anything is possible, but it takes hours and skill | Seconds, with no skill | Less control |
| VEED AI Transitions | Two clips, presets (Fly, Build, Orbit, Zoom) or prompts, auto sound effects, inside a full editor ([VEED](https://www.veed.io/tools/ai-transitions)); subscription about $12–39/month annual ([pricing](https://magichour.ai/blog/veed-pricing)) | No editor or prompt needed, recommendations for *your* pair, pay once for $9 | VEED has the brand, the SEO and sound effects |
| aitransitions.app, FlexClip, Imgveo | Two **still frames** in, a clip out; 1 free "Lite" preview plus daily check-in credits, 720p ([aitransitions.app](https://aitransitions.app/)) | Takes videos, extracts the frames itself, returns one stitched clip | They're cheap SEO pages with the same core model access |
| Higgsfield | A general AI video studio; transitions are one preset among hundreds; free plan has 0 credits, $19+/month ([Krea](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026)) | Focused, cheaper to try, works on the creator's own footage | Higgsfield's scale, model access and creator army |
| Runway, Kling, Luma, Pika | General generators; Luma and Kling offer start/end keyframes | No prompt engineering, and one finished clip | Their models are what Clipmelt rents |

**Strongest wedge (evidence-based):** creators who already shoot clips in different places and want those clips to flow as one shot. The generative "impossible" bridge is the visible product; the frame extraction, recommendation, quality check and single export are the convenience. The wedge collapses if results are slow or bad, because VEED and the SEO tools offer the same raw capability.

---

## 3. Ideal initial customer

HYPOTHESIS ranking, from the product's own sample pairs, the footage that worked in our ads, and competitor evidence:

1. **Travel and outdoor POV creators** (drone, GoPro, surf, hiking). Their clips come from different places, "seamless transition" travel Reels are an established format, and they post often.
2. **Action sports and car creators.** A clip of a car entering a tunnel and emerging somewhere else, or a board turning into a bike, is exactly what the Object Morph and Drone Dive styles do.
3. **Fashion "outfit change" and fitness transformation creators.** The transition *is* the content.
4. **Short-form editors and editing educators.** They'd use it as a tool and teach it (the tutorial loop).
5. Later: real-estate walkthroughs, and small brands' product ads (Higgsfield's revenue is about 70% enterprise and brands, per [MasterNodeAI](https://www.masternodeai.com/en/news/higgsfield-ai-5bn-valuation-funding-talks)).

The first customer to win is one creator who already posts transition content, gets a result in under 3 minutes that they'd post, and pays $9 for more.

---

## 4. Competitive research: how each competitor got first traction

| Product | First wedge / first user | First traction (evidence) | Free offer | Main distribution engine |
|---|---|---|---|---|
| **Higgsfield** | Camera-control presets for pros, then one-click effects | "Camera controls were the wedge that got pros in the door… one-click visual effects… took them to $10M ARR in about six weeks." The consumer mobile app Diffuse was "tuition" before the pivot to web and pros ([SaaStr](https://www.saastr.com/500m-arr-60-engineers-cash-flow-positive-how-higgsfield-actually-runs-with-ceo-alex-mashrabov/)). $11M ARR May 2025 → $100M Nov 2025 → $230M Jan 2026 ([Sacra](https://sacra.com/research/higgsfield-at-230m-arr/)) | 0 credits on the free plan ([Krea](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026)) | Paid creators (Earn), affiliates, localised paid masters; see section 5 |
| **Pika** | One-click "Pikaffects" (squish, melt, explode) | Its official TikTok promo drew about 1.1M likes; ordinary users posted "how to do the viral squish effect" tutorials naming pika.art ([TikTok](https://www.tiktok.com/@plannthat/video/7429087575115107591), [BrandGene](https://brandgene.io/blog/comparisons/reviews/pika-ai-review)) | Free tier with credits | User tutorials that name the site |
| **PixVerse** | Effect templates ("Venom", "Muscle Surge") | Popularity spiked Nov 1–20 and from Dec 18, 2024 on the Venom template ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/pixverse-ai-effect)) | Free credits | Template trends on TikTok |
| **Viggle** | Swap any character into a motion video (memes) | The "Lil Yachty walkout" meme template; public launch March 2024, 1M users in a month, 4M in 5 months, Discord-first ([TechCrunch](https://techcrunch.com/2024/08/26/viggle-makes-controllable-ai-characters-for-memes-and-visualizing-ideas/), [AI Wiki](https://aiwiki.ai/wiki/viggle_ai)) | Free | Meme templates plus Discord |
| **Luma Dream Machine** | Free public launch of a model with believable motion | Went "semi-viral almost immediately" in June 2024; 25M registered users ([AI Wiki](https://aiwiki.ai/wiki/luma_dream_machine)) | A daily free clip at launch, since reduced ([vidmuse](https://vidmuse.ai/blog/luma-ai-review)) | Launch virality; keyframe (start/end) features |
| **Kling** | A strong model backed by Kuaishou | Detailed first-traction data not found | **66 free credits every day**, about 6 five-second clips ([Kling](https://kling.ai/explore/kling_ai_daily_free_credits)) | Daily free habit |
| **Runway** | ML tools for creatives, then Gen-1 and Gen-2 | Product-led; AI Film Festival grew from 300 submissions (2023) to 6,000+ (2025) ([Wikipedia](https://en.wikipedia.org/wiki/Runway_(company))) | 125 one-time credits ([Runway help](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details)) | Model launches plus community contests |
| **OpusClip** | Long video → viral shorts | Shipped as a Discord bot first; $1M ARR one month after beta across 200K creators ([startupfounderstories](https://startupfounderstories.com/stories/young-zhao-opus-clip), [startupspells](https://startupspells.com/p/opusclip-ai-video-editing-tool-1m-arr-14-days)); 10M users and 57B views on clips by early 2025 ([OpusClip](https://www.opus.pro/blog/celebrating-2-years-of-opusclip-from-the-best-ai-clipping-tool-to-the-best-ai-growth-tool-for-video-creators)) | Free tier | Discord, then creators and SEO |
| **Submagic** | AI captions for shorts | **$1M ARR in 3 months.** Launched affiliates 30 days in with 30% lifetime commission; 50–70 creators aged 18–25 posting daily TikToks; now 10,000+ partners driving $1.6M of $8M ARR, bootstrapped ([SaaS Club](https://saasclub.io/podcast/submagic-david-zitoun-446/), [Superframeworks](https://superframeworks.com/case-study/submagic)) | Free trial | Affiliate creators on TikTok |
| **VEED** | A browser video editor; now AI Transitions | Grows through a large SEO tool-page library such as `/tools/ai-transitions` (FACT that the page exists; the traction history isn't documented in these sources) | Free editor | SEO plus editor-led growth |
| **aitransitions.app and similar** | Start/end-frame tools | Traction not public | 1 Lite preview plus daily check-in credits | SEO |
| **CapCut** | A free editor with TikTok distribution | An exported template adds a CapCut ending clip that users can delete ([CapCut ending template](https://www.capcut.com/template-detail/Ending-Watermark/7424553690171788549)) | Free | Templates, end cards, TikTok integration |
| **Captions, Descript, InVideo** | Captioning, podcast editing, AI generation | **Not found in my searches.** I'm not guessing their first-traction story | — | — |

**The pattern (evidence-based):**
- A single named effect that viewers can see and copy.
- Users make "how to do this" content that names the product.
- Creators get paid, by affiliate share or per campaign.
- Free trial output that's good enough to post.
- Discord-first worked in 2023–24 (OpusClip, Viggle), but that era's advantage is weaker now (HYPOTHESIS).

---

## 5. Higgsfield growth teardown

FACTS:
- **Founder:** Alex Mashrabov, former head of generative AI at Snap, whose AI Factory Snap acquired for $166M ([productgrowth.blog](https://www.productgrowth.blog/p/higgsfield-growth-teardown)).
- **Sequence:**
  1. The mobile app Diffuse (selfie to video) didn't retain users.
  2. A web launch for pro creators in March 2025 reached $10M ARR within weeks.
  3. $50M ARR and cash-flow positive by August 2025.
  4. $200–230M ARR by January 2026 ([productgrowth.blog](https://www.productgrowth.blog/p/higgsfield-growth-teardown), [Sacra](https://sacra.com/research/higgsfield-at-230m-arr/)).
  5. The CEO cites $500M ARR with about 60 engineers ([SaaStr](https://www.saastr.com/500m-arr-60-engineers-cash-flow-positive-how-higgsfield-actually-runs-with-ceo-alex-mashrabov/)).
- **Product wedge:** camera controls ("no intention behind the camera" was why pros rejected AI video), then one-click effects built on Snap face-filter experience. Model aggregation came after betting on its own model failed within weeks.
- **Shipping pace:** 4–7 releases a week, about 10 new video presets a day, and weak presets cut based on engagement ([productgrowth.blog](https://www.productgrowth.blog/p/higgsfield-growth-teardown)).
- **Creator distribution:**
  - **Higgsfield Earn** paid creators per view: 10,000+ creators, $1M+ paid out, 3B+ impressions, 300K paying subscribers in under a year ([productgrowth.blog](https://www.productgrowth.blog/p/higgsfield-growth-teardown), [Higgsfield Earn](https://higgsfield.ai/earn)).
  - A Creator Partnership Program gives monthly credits and early access ([Higgsfield](https://higgsfield.ai/creator-partnership-program)).
  - An affiliate program pays up to 25% of plan price via FirstPromoter ([Higgsfield affiliate](https://higgsfield.ai/affiliate)).
- **Paid ads** (my Ad Library research earlier this session):
  - Higgsfield's own Meta page ran zero ads, while about 430 active video ads ran through partner and agency pages.
  - The YouTube masters were a 15 s English cut ([540K views](https://www.youtube.com/watch?v=KDKUNTrxjoY), mastered at −12.9 LUFS, 6 of 10 cuts on the 136 BPM kick), localised into about 10 languages ([DE](https://www.youtube.com/watch?v=LqkZdxwNI_0), [FR](https://www.youtube.com/watch?v=9oc_DVvZZhk), [IT](https://www.youtube.com/watch?v=cUoOJBDwHbY), [SP](https://www.youtube.com/watch?v=Pe5LH0ThwlY)…).
  - Plus a 6 s bumper ([DE](https://www.youtube.com/watch?v=H9aybI265t4)) and an 11 s "Free AI Video Generator" card ([42K](https://www.youtube.com/watch?v=COXq1bluztU)).
- **Organic brand channel is weak:** its YouTube Shorts channel (about 438K subscribers, 147 Shorts) gets a **median of 14K views**, peaking at 110K. The engine is paid creators and paid masters, not brand posts.
- **Community:** the Higgsfield AI Film Festival 2026 (entries like [this one](https://www.youtube.com/watch?v=miNfT_JSzpk)).
- **The reckoning (February 2026):** Forbes reported misleading, "overly polished" influencer templates the average user couldn't reproduce, "unlimited" plans that were throttled, offensive paid content, and unpaid creators. Its X account was suspended for inauthentic behaviour ([productgrowth.blog](https://www.productgrowth.blog/p/higgsfield-growth-teardown)).

**What transfers to Clipmelt without Higgsfield's budget:**

| Mechanism | Transferable? | How, for Clipmelt |
|---|---|---|
| Named one-click effects | **Yes, core** | 3 named hero transitions (Drone Dive, Object Morph, Environment Morph), each with its own page and a "use with my clips" button |
| Cut weak presets by engagement data | Yes | Track per-style selections, successes and downloads, and promote the winners |
| Paid creators | Partly | Affiliate lifetime share (Submagic model), not pay-per-view |
| Localised paid masters | Later | After a winning creative exists |
| Aggregating many models | Already built (router) | Keep at least one fast, reliable model *funded* |
| Throttled "unlimited" plans, over-polished demos | **No** | Show only results the live app can reproduce |
| Enterprise and marketing agents | Not now | Revisit after 100 paying creators |

---

## 6. Current Clipmelt ad teardown (`public/ads/clipmelt-chain-916.mp4`, 21.63 s, 9:16)

I reviewed it frame by frame at 1 fps and 4 fps and measured the audio envelope every 0.5 s. **Viewed at feed size:** the lime AI chips are about 10 pt on a 390 pt-wide phone, the "REAL CLIP" chips about 9 pt, and the URL pill about 11 pt. **Muted:** only three captions carry meaning (0–1.5 s, 16–17.5 s, and 17.5–19.4 s on the app screens).

| Time | What the viewer sees | Understands | Question created | Curiosity | Problem |
|---|---|---|---|---|---|
| 0.0–1.5 s | Feet dangling over a green lagoon; "5 clips. 5 different people."; `clipmelt.com` pill | A cliff jump is coming | "Is he jumping?" | Medium | Almost no motion; audio drops to about −30 dB from 0.5–1.5 s (**1-second drop risk**) |
| 1.5–2.4 s | Fall, then dive straight into a wave barrel; lime "CLIPMELT · AI TRANSITION 1/4 · Drone Dive" | "Whoa" | "How did that happen?" | **High** | The best moment is ~1.8 s in; it should be frame 1 |
| 2.4–4.5 s | Surfer in the barrel (AI, then real) | Surf video | None | Falls | Nothing new, and "5 clips" isn't explained (**3-second drop**) |
| 4.5–7.2 s | Real surf carve | Surf video | None | Falls | Dead time for anyone who isn't a surfer (**5-second drop**) |
| 7.2–9.7 s | The surfboard grows wheels; wave to pavement (Environment Morph) | "It changed!" | "What app?" | High | Label too small to read |
| 9.7–13.6 s | Skate ollie, then skateboard to BMX (Object Morph) | Impressive | "How?" | High | Strongest transformation, buried at 11 s |
| 13.6–15.5 s | BMX passes; empty sky; white cloud | Nothing | None | Falls | **About 1.5 s of dead sky** |
| 15.5–17.5 s | Paraglider legs; "5 real clips. 4 AI transitions." | "Oh, it's an AI transitions tool" | — | — | The explanation comes 15 s too late |
| 17.5–19.4 s | App screenshots, "you give it 2 clips" / "clipmelt makes the transition" | It's an app | — | — | The UI text is unreadable on a phone |
| 19.4–21.6 s | Glitch sting: Clipmelt, `clipmelt.com`, "your first 3 transitions are free" | Brand + offer | — | — | The CTA comes after most viewers have left |

**Verdicts:**
- **Hook: 6/10.** A cliff edge is a decent thumb-stop for outdoor audiences. The real hook, the dive, arrives at about 1.8 s, and the first second is nearly silent.
- **Comprehension: 4/10.** Muted, it reads as an extreme-sports montage until 16 s.
- **Proof: 7/10.** The transformations are clearly generated and clearly labelled. The inputs are never shown side by side, though, so "we only made the in-between" isn't proven.
- **Desire: 6/10.** Strong for action and travel creators. Everyone else thinks "I don't have surf footage."
- **CTA: 5/10.** "Your first 3 transitions are free" is fine, but late and small. The persistent URL helps recall.
- **Honesty risk.** These bridges were generated by me via the Higgsfield API (MiniMax H3), using Clipmelt's recipes, not by the live app, which is currently failing on real footage. Running this ad before the app can reproduce the results repeats Higgsfield's "overly polished templates" mistake.

**Re-cut rules for v4** (EXPERIMENT; renderer changes are cheap):
- Open mid-dive at 0.0 s.
- Add a persistent line: "the clips are real · the in-between is AI".
- Show the two input clips as small thumbnails in the first 2 s.
- Keep only the 3 smoothest transitions.
- Cut the dead sky.
- Replace the screenshots with 1.5 s of a real phone screen recording.
- Put the CTA at about 8 s and again at the end.
- Target 12–14 s, plus a 6–8 s single-transition micro version.

---

## 7. Creative concepts (17 distinct concepts)

The format for each: **Hook / first frame, 0–2 s, 2–5 s, middle, CTA, length and platform, why it might work, difficulty, hypothesis tested.**

1. **Raw screen recording: "I gave this AI two random clips."**
   - Hook / first frame: a phone camera roll with two unrelated clips selected.
   - 0–2 s: tap upload. 2–5 s: the result plays full-screen. Middle: a second pair. CTA: "clipmelt.com, first one's free."
   - 10–15 s, TikTok and Reels.
   - Why: native and believable. Difficulty: very low.
   - Tests: *does showing the real UX convert better than polish?*
2. **Before / after split.** Top: a hard cut or crossfade. Bottom: Clipmelt, same clips.
   - First frame: split with the labels "crossfade" / "clipmelt". 0–2 s: both play. 2–5 s: the Clipmelt bridge lands. CTA: end card.
   - 8–12 s, all platforms. Why: instant comparison. Low (renderer exists).
   - Tests: *comparison proof vs spectacle.*
3. **Single-transition micro-ad.** Only the skateboard → BMX morph.
   - First frame: the skater mid-ollie with "this was 2 different videos". 0–2 s: the morph. 2–5 s: the BMX flies over the lens. CTA: URL + "try it on your clips".
   - 6–8 s, TikTok, Reels, Shorts. Why: the best moment with nothing diluting it. Very low.
   - Tests: *is one wow enough?*
4. **"Guess which part is AI."**
   - First frame: a travel one-take with the caption "one of these 3 seconds is AI". 0–5 s: plays clean. Middle: freeze + reveal with the AI segment highlighted. CTA: "make yours at clipmelt.com".
   - 10–14 s, TikTok. Why: comments and replays feed the algorithm. Low.
   - Tests: *engagement-driven reach.*
5. **"Stop crossfading your travel reels."** Creator POV talking to camera with B-roll.
   - 0–2 s: an ugly crossfade with an ❌. 2–5 s: the Clipmelt bridge with a ✓. CTA: link in bio.
   - 12–20 s, Reels and TikTok, niche travel. Low.
   - Tests: *travel-niche pain framing.*
6. **CapCut vs Clipmelt.** Same two clips.
   - 0–2 s: a CapCut template zoom transition. 2–5 s: Clipmelt's generated bridge. CTA: "free to try".
   - 10–15 s, TikTok. Why: talks to people who already edit on CapCut. Low. Avoid disparaging claims; show both honestly.
   - Tests: *switching intent from CapCut users.*
7. **"This took me 3 hours in After Effects / 40 seconds here."**
   - 0–2 s: an AE timeline time-lapse. 2–5 s: the Clipmelt upload and result. CTA: URL.
   - 12–18 s, TikTok and X. Medium (needs an honest manual version).
   - Tests: *the time-saving motive for editors.*
8. **Transition compilation: "4 transitions no editor could do."** The current chain ad, cut to 12–14 s per the rules above.
   - First frame: mid-dive. CTA: end card. TikTok and Reels. Low.
   - Tests: *spectacle vs explanation.*
9. **Meme: "My editor after seeing this."** A reaction face, then the transition.
   - 6–10 s, TikTok. Why: memes reach creators. Low.
   - Tests: *meme reach (watch the fit with the brand).*
10. **Tutorial as content: "How to do the drone-dive transition (no drone)."** Steps on screen, done in 15 s.
    - CTA: "tool in bio". TikTok, YouTube Shorts (search), Pinterest. Why: saves and search traffic. Low.
    - Tests: *search and save-driven discovery.*
11. **Car creators: "car enters tunnel → exits in Tokyo."**
    - 8–12 s, TikTok. Medium (needs licensed car clips).
    - Tests: *car niche resonance.*
12. **Fashion outfit change (mirror → new outfit).**
    - 8 s, TikTok and Reels. Medium. Why: outfit transitions are an established trend format.
    - Tests: *fashion niche.*
13. **Real estate: front door → living room fly-through.**
    - 10–15 s, Reels and LinkedIn. Medium.
    - Tests: *willingness to pay from prosumers.*
14. **Fitness "then → now" (clothing or setting change, no body-shaming claims).**
    - 8–10 s. Medium.
    - Tests: *fitness niche.*
15. **Founder build-in-public on X: "I built an AI that only edits the in-between."**
    - A native demo video, with the link in the first reply. Why: early adopters and editors on X. Very low.
    - Tests: *founder-led vs product-led.*
16. **Free-tool hook (UGC voice): "This free website makes impossible transitions."**
    - 10–15 s, TikTok. Low (requires the free offer to be real and instant).
    - Tests: *offer framing, "free", on CTR and trials.*
17. **Comment challenge: "Send me 2 clips, I'll connect them."** Reply-to-comment videos using commenters' clips (with permission).
    - Ongoing, TikTok. Low. Why: interactive, and every reply is a demo.
    - Tests: *community loop and reply-video reach.*

**First test batch (5, distinct hypotheses):** #1 raw UX, #2 comparison proof, #3 single-wow micro, #16 free-offer framing, #17 interactive reply loop. Each gets 2 hook variants. Judge on click-through to clipmelt.com and trial starts, not views.

---

## 8. Distribution strategy

| Channel | Audience fit | Role | Cadence | Link behaviour | CTA style | Who posts |
|---|---|---|---|---|---|---|
| **TikTok** | Highest: short-form creators | Primary organic + later Spark Ads | 1–3/day for 7 days | No clickable links in captions. The bio link needs 1,000 followers **or a Business account** ([Stan](https://stan.store/blog/tiktok-link-bio-requirements-2026-guide/)) | "link in bio" / "search clipmelt" | A Business brand account + a founder account |
| **Instagram Reels** | High (travel, fashion, fitness) | Repost the same assets natively | 1/day | Bio link and Story link sticker | "link in bio" | Brand |
| **YouTube Shorts** | Medium; search-driven | Tutorials (#10) and micro-ads | 1/day | Links in comments and description aren't prominent | "Search clipmelt" | Brand |
| **X** | Editors, AI enthusiasts, indie founders | Founder-led demos and build-in-public | 1–2/day | Posts with body links get roughly 30–50% less initial reach in 2026 analyses; put the link in the first reply ([SocialPilot](https://www.socialpilot.co/blog/twitter-algorithm), [Buffer](https://buffer.com/resources/links-on-x/)) | Link in reply | Founder |
| **Reddit** (r/aivideo, r/VideoEditing, r/Filmmakers) | Editors; wary of self-promotion | Show-your-work posts and feedback asks | 2–3 total this week | Rules vary; check each subreddit before posting (HYPOTHESIS: pure promotion gets removed) | "Built this, feedback?" | Founder |
| **Product Hunt** | AI tool early adopters, not creators | One-time spike and a backlink | Once, **after** reliability is proven | — | — | Founder |
| **Hacker News** | Poor fit | Skip, or one "Show HN" on the routing and judge engine | — | — | — | — |
| **Discord** (AI video servers) | Enthusiasts | Share in showcase channels | Low | — | — | Founder |
| **Facebook groups / Threads** | Low | Skip for now | — | — | — | — |

**One session, many assets** (the system):
1. One generation session of 3 transitions yields:
   - a 6–8 s micro (#3)
   - a before/after split (#2)
   - a tutorial overlay (#10)
   - an X native video
   - a public gallery page
2. The renderer (`scripts/motion/*`) already turns clips into these formats. Add a text-only variant per platform so accounts don't look copy-pasted: different first-frame caption, crop and music per platform.
3. Tag every link in bios with UTM parameters, e.g. `clipmelt.com/?utm_source=tiktok&utm_campaign=bio`.
4. **Label AI content:** TikTok requires the AI-generated content label or disclaimer on ads and on realistic AI content, or the ad is rejected or restricted ([Cinerads](https://www.cinerads.com/blog/tiktok-ai-content-policy)).

---

## 9. Creator strategy

- **Who:** micro-creators with 5K–100K followers who already post transitions: travel and drone (#seamlesstransition, #travelreels), action sports, cars, fashion outfit changes, editing educators. They benefit because the impossible transition *is* their content (HYPOTHESIS).
- **Offer** (optimised for distribution per dollar):
  1. **A custom transition made from their own last 2 clips, sent in the DM** (reciprocity). The cost to us is about $0.40–1.00.
  2. 100 free credits (≈ 50 previews, about $20 of our cost at full use).
  3. **30% lifetime affiliate share** with a unique `?ref=` code (Submagic's proven structure: 30% lifetime, 50–70 creators posting daily, $1M ARR in 3 months).
  4. Pay a flat $150–300 only to creators whose free post showed traction. Market rates for 10K–100K creators run roughly $150–1,500 per integration ([InfluencerFee](https://influencerfee.com/blog/tiktok-influencer-pricing/)).
  5. Ask for Spark Ads permission on winning posts.
- **Avoid:** pay-per-view programs (Higgsfield Earn's content scandal), and demos creators can't reproduce.
- **Outreach system:**
  1. Build a sheet of 50 creators (niche, followers, average views, contact).
  2. Send 10 DMs a day with a custom transition attached.
  3. Follow up in 48 h.
  4. Track replies, posts, clicks, signups and purchases per `ref`.
  5. Target (EXPERIMENT): ≥20% reply rate and ≥5 posts from the first 50.

---

## 10. Viral product loop

What exists (FACT): public share pages (`/t/[id]`) with a "Try Clipmelt" button, a `shared` event, and a public `/library`. Exported files carry **no attribution**.

The smallest mechanism with the biggest upside (ranked):
1. **Share page → "Make this transition with your clips"** (style pre-selected) plus the sharer's referral code. When a referred visitor completes a generation, both get +2 credits.
2. **An optional 1-second end card, "made with clipmelt.com", on free exports**, default on for free runs, removable on paid. CapCut's deletable ending clip is the precedent. Test it against conversion and share rate (EXPERIMENT).
3. **A public page per hero transition** (`/t/drone-dive` style) with examples and a "use with my clips" button. It serves as SEO, as a creator link target, and as a template entry point.
4. **A before/after export option:** the split comparison, which is the most shareable asset (#2).
5. Later: remix feed, trending transitions, creator profiles.

Don't: a heavy watermark over the video, or a community feed before 100 active users.

---

## 11. Landing-page changes (only those that matter for conversion)

FACT (mobile audit at 375 px):
- The hero reads *"Make the cut. Break reality. / Two clips. A connection you never saw coming."*
- The CTA says "Make your first transition".
- The hero demo card (coffee → ocean) **does autoplay**, muted, once it scrolls into view. Only the three story chapters below it are scroll-scrubbed (`autoplay=false`). *(Corrected: the first draft said nothing autoplayed.)*
- There's **no mention of free or price**, no social proof and no FAQ.
- It weighs 4.9 MB and loads fast (DOMContentLoaded about 0.1 s on a warm cache).
- `og:image` still points to `seamcut.onrender.com`: the build falls back to the old host (`src/lib/server/site.ts`).
- There are no analytics or ad pixels.

Changes, in priority order:
1. **Make the autoplaying hero card read as before/after**: label the two inputs and the result, and keep it above the fold on mobile.
2. **A literal headline:** "Turn two clips into one impossible shot. AI makes only the part in between." Keep the brand line smaller.
3. **CTA:** "Try it free — no signup", plus microcopy: "1 free transition · then $9 for 15".
4. **A "try with our sample clips" one-tap CTA** for visitors without clips on hand. The sample pairs already exist on `/create`.
5. **A 4-question FAQ:** How long does it take? Is my footage mine? What does it cost? What if it fails? (Answer: you're refunded.)
6. Fix the `og:image` fallback host (one line).
7. Add social proof once real: "x transitions made".

---

## 12. Analytics requirements

Exists (FACT):
- Server events: `upload_completed/failed`, `analysis_started/completed/failed`, `transition_selected`, `generation_started/succeeded/failed`, `downloaded`, `shared`, `signup`, `login`, `second_project_created`.
- An ops-only `/api/metrics` with a funnel and cost per generation.

Missing (build before traffic, about 2–3 h):
- **First-touch attribution on the guest record:** `utm_source/medium/campaign/content`, `ref` (creator code), `document.referrer` host, landing path, device class, first-seen timestamp. Captured once and joined to later events. No IPs or personal data beyond that.
- **Events:** `landing_view`, `cta_click`, `paywall_shown`, `checkout_started` (when the checkout URL is issued), `purchase` (from the webhook, with amount and pack), `second_generation`, `credits_exhausted`.
- **A funnel report** per campaign, creative and ref: visits → trial starts (upload) → generations completed → downloads → signups → checkout → purchases → repeat purchases.
- **Pixels (TikTok and Meta) only when paid tests start,** with consent handling.
- **Goal statement:** "Creative B on TikTok → 3,800 visits → 410 uploads → 173 completed generations → 24 purchases."

---

## 13. Pricing and free-credit analysis

- **Unit economics (FACT + estimate):**
  - Stripe takes $0.56 of a $9 purchase (FACT, from the test charge).
  - The repo's own estimate for an accepted preview is $0.36–0.42, and failed or rejected attempts also cost money (today's failed run: about $0.41 with nothing delivered).
  - Revenue per preview: Starter $0.60, Pro $0.48, Studio $0.45.
  - If all credits are used, gross margin is about **27% on Starter** ($8.44 − 15 × $0.40 ≈ $2.44), **about 13% on Pro**, and **about 7% on Studio**.
- **Free trial exposure:**
  - A guest gets 3 previews, and signing up grants 3 more, so a person can use up to 6 (about $2.40 of cost).
  - The guest cap of 10 identities per IP per day resets on every deploy.
  - With a typical 2–5% free-to-paid conversion (HYPOTHESIS for this product), 6 free previews per person costs more than the first $9 purchase earns.
- **Competitor offers:** Higgsfield has 0 free credits, Runway 125 one-time credits (about 10 s of its best model), Kling 66 a day, and aitransitions.app 1 preview.
- **Recommendation:**
  - **1 instant free preview with no signup**, the fastest way to the wow.
  - **+2 after Google sign-in**.
  - An optional end card on free exports.
  - Keep the $9 entry pack but raise the Studio price or shrink its credits, since it's near break-even.
  - Referral: +2 credits to both sides after the referee completes a generation.
  - No daily free credits at these costs.
  - Route free previews to the cheapest model that passes the quality bar.

---

## 14. Paid acquisition strategy

- **Not rational yet.** First the first run must succeed (at least 90% within 3 minutes), attribution must exist, and the landing page must convert visits into uploads at 25% or better.
- **Benchmarks:**
  - TikTok: median CPC about $0.62 and CTR about 1.18% across 2026 datasets ([Digital Applied](https://www.digitalapplied.com/blog/tiktok-ads-benchmarks-2026-cpc-cpm-cvr-industry), [Influee](https://influee.co/blog/tiktok-ads-benchmarks)).
  - Instagram: CPC about $0.40–1.80; Reels CPM runs 30–50% below Feed ([AdLibrary](https://adlibrary.com/posts/instagram-advertising-costs)).
- **Break-even math (HYPOTHESIS):**
  - At $0.62 a click and a 2% visit-to-purchase rate, the cost per first purchase is about $31, against $2.44 gross on a Starter pack.
  - Paid only works with repeat purchases, a higher conversion rate, or cheaper Spark Ads on proven creator posts.
- **The first test buys information:**
  - $150 on TikTok Spark Ads (boosting the best organic or creator post), traffic objective, UTM-tagged, over 3–4 days.
  - Measure CTR, CPC, landing → upload, upload → completed generation, and → purchase.
  - Scale only if the full-funnel cost per purchase is below 3× first-purchase gross profit *and* repeat purchases show up.

---

## 15. 72-hour launch plan

**Tonight (Day 0):**
1. **Fund fal** (only you can make this top-up), or confirm another fast model is funded. Then I re-run the real-footage test **3 times**. The gate: all 3 succeed in under 3 minutes.
2. **Point the Payment Link redirects and the webhook at `clipmelt.com`.** Today's buyers return to `seamcut.onrender.com/account`, a different host, so they land logged out. Needs your OK.
3. **Ship first-touch attribution** plus `checkout_started`, `purchase` and `cta_click`, and the funnel-by-campaign report (me, about 2–3 h).
4. **Landing fixes 1–3 and 6** from section 11 (me, about 1–2 h).
5. **Create a TikTok Business account**, Instagram, YouTube and an X founder account, each with a UTM bio link.

**Tomorrow (Day 1):**
- Produce test batch #1, #2, #3, #16 and #17 from 2 generation sessions made **through the live app**.
- Post 3 on TikTok, cross-post to Reels and Shorts, and publish the founder X post (#15).
- DM 20 creators with a custom transition each.

**Day 2:**
- Review 3-second hold, average watch time, profile visits, link clicks (UTM visits), uploads and completed generations per creative.
- Kill the bottom 2 creatives and make 3 variants of the top one.
- Post the reply videos for concept #17.

**Day 3:**
- Double down on the winning hook with 3 new variants.
- Onboard the creators who replied (codes and credits).
- Spend $100–150 on Spark Ads behind the best post, **only if** the gates hold: first-run success ≥90%, landing → upload ≥25%.

---

## 16. Seven-day sprint

| Day | Create | Post | Experiments | Outreach | Product (only if needed) | Review / decision gate |
|---|---|---|---|---|---|---|
| 1 | 5 creatives (batch 1) | 3 on TikTok, cross-post | Hook A/B on #3 | 20 creator DMs | — | Posts live, tracking works |
| 2 | 3 variants of the best one | 3 | #16 free framing vs #1 raw UX | 10 DMs + follow-ups | Share-page "make this" button | Kill anything under 25% 3-second hold |
| 3 | Tutorial (#10) | 3 + X thread | Spark Ads $100 (if gated) | Onboard affiliates | — | Visit → upload ≥25%? |
| 4 | Niche tests: travel (#5), car (#11) | 3 | Niche resonance | 10 DMs to that niche | Referral credits | Uploads → completed ≥80%? |
| 5 | Comparison (#2), CapCut (#6) | 3 | Proof vs spectacle | Creator posts go live | — | Which concept wins on uploads, not views |
| 6 | Reply videos (#17) | 3–5 | Comment loop | Thank-you + Spark permissions | End card on free exports (A/B) | Share page visits per export |
| 7 | Remix of the top 2 | 3 | — | — | — | Paid purchases per channel; decide the next week's budget |

---

## 17. Experiments and metrics (execution order)

| # | Experiment | Effort | Cost | Speed to signal | Primary metric | What we learn |
|---|---|---|---|---|---|---|
| 1 | Fund fal / re-run 3 real-footage tests | Very low | <$50 (top-up) | Hours | First-run success in under 3 min | Can we take traffic at all |
| 2 | Payment Link redirect → clipmelt.com | Very low | $0 | Hours | Post-purchase sessions still logged in | Checkout isn't leaking |
| 3 | First-touch attribution + purchase events | Low | $0 | Hours | Funnel by campaign renders | We can measure |
| 4 | Landing: autoplay before/after + literal headline + free microcopy | Low | $0 | 1–2 days | Visit → upload | Clarity vs vibe |
| 5 | Free offer: 1 instant + 2 after sign-in (vs today's 3 for guests) | Low | $0 | 3–7 days | Upload → signup, cost per activated user | Cheaper activation without losing wow |
| 6 | Creative batch 1 (5 concepts) | Low | $0 | 1–2 days | UTM visits and uploads per post | Which hypothesis wins |
| 7 | Creator DMs with custom transitions | Low | <$50 | 3–7 days | Reply rate, posts, ref signups | Creator loop viability |
| 8 | Affiliate 30% lifetime + ref codes | Low | $0 upfront | Weeks | Purchases per ref | Scalable distribution |
| 9 | Share page "make this transition" + referral credits | Low | $0 | 3–7 days | Signups per share | Viral coefficient |
| 10 | End card on free exports | Low | $0 | 3–7 days | Share page / visits from exports; conversion impact | Attribution vs annoyance |
| 11 | Hero transition pages (3) | Medium | $0 | Weeks | Organic search visits | SEO + template entry |
| 12 | Spark Ads $150 | Very low | $50–250 | 1–2 days | Cost per completed generation / purchase | When paid is rational |
| 13 | Founder X build-in-public | Very low | $0 | 1–2 days | Reply-link clicks, signups | Founder-led channel fit |
| 14 | Product Hunt launch | Medium | $0 | Hours (one day) | Signups that generate | Worth repeating? |

---

## 18. What NOT to waste time on

- Buying traffic before the first run reliably succeeds, meaning before experiment 1 passes.
- Polishing more 20 s showreels; short, raw, testable variants win on learning speed.
- Pay-per-view creator programs, or demos the live app can't reproduce (Higgsfield's February 2026 lesson).
- Product Hunt, a Discord server, a community feed or an SEO blog farm this week.
- Daily free credits (the unit costs don't support them).
- Heavy visible watermarks that ruin the output.
- New models or styles; the catalog is already 49 deep. Promote 3.
- Vanity metrics: views without uploads and purchases.

---

## 19. Exact next actions

1. **You:** top up fal (or tell me which funded model to prioritise). I then run 3 real-footage tests on clipmelt.com and report success rate and time.
2. **You:** OK me to change the three Payment Link redirects and the webhook URL to `clipmelt.com`. I do it with the Stripe CLI and verify.
3. **Me:** ship attribution and purchase events, the landing fixes (before/after labels, literal headline, free microcopy, og:image host) and the free-offer change (1 + 2 after sign-in) behind a switch. Tests, deploy, verify.
4. **Me:** render creative batch 1 (5 concepts × 2 hooks) from results made **through the live app**, with AI labels, plus a 12–14 s v4 of the chain ad.
5. **You:** create a TikTok Business account and Instagram, YouTube and X accounts, and post per the 72-hour plan. **Me:** a 50-creator outreach sheet with DM copy and custom transitions for the first 10.
6. Review on Day 2 and Day 3 against the gates above.

---

## Sources

Higgsfield: [productgrowth.blog teardown](https://www.productgrowth.blog/p/higgsfield-growth-teardown) · [SaaStr interview](https://www.saastr.com/500m-arr-60-engineers-cash-flow-positive-how-higgsfield-actually-runs-with-ceo-alex-mashrabov/) · [Sacra $230M ARR](https://sacra.com/research/higgsfield-at-230m-arr/) · [MasterNodeAI](https://www.masternodeai.com/en/news/higgsfield-ai-5bn-valuation-funding-talks) · [Creator Partnership Program](https://higgsfield.ai/creator-partnership-program) · [Affiliate](https://higgsfield.ai/affiliate) · [Earn](https://higgsfield.ai/earn) · [Krea pricing](https://www.krea.ai/blog/what-is-higgsfield-ai-pricing-free-plan-and-alternatives-in-2026) · YouTube masters [EN](https://www.youtube.com/watch?v=KDKUNTrxjoY) [DE](https://www.youtube.com/watch?v=LqkZdxwNI_0) [6 s](https://www.youtube.com/watch?v=H9aybI265t4) [free card](https://www.youtube.com/watch?v=COXq1bluztU)
Pika: [official TikTok](https://www.tiktok.com/@pika_labs/video/7420907267333098782) · [user tutorial](https://www.tiktok.com/@plannthat/video/7429087575115107591) · [BrandGene](https://brandgene.io/blog/comparisons/reviews/pika-ai-review) — PixVerse: [Atlas Cloud](https://www.atlascloud.ai/blog/tips/pixverse-ai-effect) — Viggle: [TechCrunch](https://techcrunch.com/2024/08/26/viggle-makes-controllable-ai-characters-for-memes-and-visualizing-ideas/) · [AI Wiki](https://aiwiki.ai/wiki/viggle_ai) — Luma: [AI Wiki](https://aiwiki.ai/wiki/luma_dream_machine) · [vidmuse](https://vidmuse.ai/blog/luma-ai-review) — Kling: [daily credits](https://kling.ai/explore/kling_ai_daily_free_credits) — Runway: [Wikipedia](https://en.wikipedia.org/wiki/Runway_(company)) · [free plan](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details)
OpusClip: [2-year post](https://www.opus.pro/blog/celebrating-2-years-of-opusclip-from-the-best-ai-clipping-tool-to-the-best-ai-growth-tool-for-video-creators) · [founder story](https://startupfounderstories.com/stories/young-zhao-opus-clip) · [startupspells](https://startupspells.com/p/opusclip-ai-video-editing-tool-1m-arr-14-days) — Submagic: [SaaS Club](https://saasclub.io/podcast/submagic-david-zitoun-446/) · [Superframeworks](https://superframeworks.com/case-study/submagic)
VEED: [AI Transitions](https://www.veed.io/tools/ai-transitions) · [pricing](https://magichour.ai/blog/veed-pricing) — [aitransitions.app](https://aitransitions.app/) — CapCut: [ending template](https://www.capcut.com/template-detail/Ending-Watermark/7424553690171788549) · [loop transitions](https://www.capcut.com/template/effects/loop-transitions)
Ads and platforms: [Digital Applied TikTok benchmarks](https://www.digitalapplied.com/blog/tiktok-ads-benchmarks-2026-cpc-cpm-cvr-industry) · [Influee](https://influee.co/blog/tiktok-ads-benchmarks) · [AdLibrary Instagram costs](https://adlibrary.com/posts/instagram-advertising-costs) · [SocialPilot X algorithm](https://www.socialpilot.co/blog/twitter-algorithm) · [Buffer links on X](https://buffer.com/resources/links-on-x/) · [Stan TikTok bio link](https://stan.store/blog/tiktok-link-bio-requirements-2026-guide/) · [Cinerads TikTok AI policy](https://www.cinerads.com/blog/tiktok-ai-content-policy) · [InfluencerFee rates](https://influencerfee.com/blog/tiktok-influencer-pricing/)
Clipmelt facts: live checks of clipmelt.com (2026-09-24), `src/lib/server/billing.ts`, `src/db/repo.ts`, `src/lib/server/ratelimit.ts`, `src/app/t/[id]/page.tsx`, production run `gen_b45daruw9xju`, Stripe live account (read-only).
