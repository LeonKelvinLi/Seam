/*
 * Clipmelt v2 "creator" cut (vertical), built to read as a creator post rather than an AI ad:
 *   1. a real-footage one-take: three stock clips shot by three different people, joined by two generated bridges,
 *      speed-ramped to the music (the splash lands on the drop; the bed is muffled while the camera is under water);
 *   2. a freeze on the ollie, then a tape-style rewind over an editor timeline that marks the two generated shots;
 *   3. the real app as a screen recording, then back to the footage for the offer.
 * Native caption boxes and no brand motifs (no orb, sparkle, streaks or glow). The only accent is the product's own
 * lime, used on the generated clips in the timeline. Edit points are in beats (R.beat); S.reel lists the clip windows
 * in playback order.
 */
(function () {
  const R = window.R, S = R.S, B = R.beat;
  const { W, H, E, prog, lerp, clamp, LIME } = R;
  const M = { breach: 7, zero: 12, peak: 27, rw0: 27.5, rw1: 31, app: 31.5, rec: 33.5, fin: 35.5 };
  const T = Object.fromEntries(Object.entries(M).map(([k, v]) => [k, v * B]));
  // Speed ramp: [beat, position on the reel in seconds of footage]. The splash lands on the drop at 3 beats. About 1x on the hero moments (cliff edge, splash,
  // breach, carve, ollie); fast under water, on the paddle-in and through the skater's crouch.
  const WARP = [[0, 1.23], [3, 2.6], [3.66, 2.9], [5.8, 6.45], [7, 7.13], [9, 8.3], [12, 11.0], [13.5, 13.8],
    [18, 17.1], [19, 17.75], [20.5, 19.4], [22, 20.4], [24, 24.0], [27, 25.8]];
  const FIN_V = 6.9; // the ending replays the breach into the barrel (a generated shot) under the offer
  const V0 = WARP[0][1], VEND = WARP[WARP.length - 1][1];
  const reel = S.reel;
  const starts = [];
  let acc = 0;
  for (const r of reel) { starts.push(acc); acc += r.to - r.from; }

  const warp = R.monotone(WARP.map(([b, v]) => [b * B, v]));

  /** Reel position (seconds of footage) shown at timeline time t: ramped playback, freeze, rewind, hold. */
  function reelPos(t) {
    if (t <= T.peak) return warp(t);
    if (t <= T.rw0) return VEND;
    if (t <= T.rw1) return lerp(VEND, V0, E.inOutCubic(prog(t, T.rw0, T.rw1)));
    return V0;
  }
  function clipAt(V) {
    let i = reel.length - 1;
    while (i > 0 && V < starts[i]) i--;
    const r = reel[i];
    return { name: r.clip, src: Math.min(r.to, r.from + (V - starts[i])) };
  }

  const capHtml = (s) => `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em;` +
    `-webkit-box-decoration-break:clone;box-decoration-break:clone">${s}</span>`;
  /** Native-style caption (white box, black text), on screen for [t0, t1) with a three-frame pop. */
  function cap(id, s, t, t0, t1, cy) {
    if (t < t0 || t >= t1) return;
    const p = t0 <= 0 ? 1 : E.outCubic(prog(t, t0, t0 + 0.1));
    R.text(id, capHtml(s), { x: 70, w: W - 140, cy, size: 56, weight: 700, lh: 1.5, ls: -0.012, wrap: true, s: 0.94 + 0.06 * p, opacity: clamp(p * 2), z: 40 });
  }

  /** Editor timeline (NLE-style filmstrip), shown during the rewind. Generated clips are marked. */
  function strip(t, V) {
    const k = E.outCubic(prog(t, T.rw0, T.rw0 + 0.22));
    const o = { ty: (1 - k) * 90, opacity: k };
    const x0 = 40, wAll = W - 80, gap = 6, y0 = 1215, th = 196, py = 1010;
    const pps = wAll / VEND;
    R.box("tlPanel", { x: 0, y: py, w: W, h: H - py }, { bg: "linear-gradient(180deg, rgba(16,16,15,0) 0%, rgba(16,16,15,0.9) 12%, rgba(14,14,13,0.97) 40%)", ...o, z: 30 });
    const fr = Math.round(V * 30);
    R.text("tlTc", `00:${String(Math.floor(fr / 30)).padStart(2, "0")}:${String(fr % 30).padStart(2, "0")}`,
      { x: x0, w: 400, y: py + 50, size: 34, font: "mono", weight: 600, ls: 0.02, align: "left", ...o, z: 31 });
    R.text("tlSum", copy().summary || "3 filmed · <em>2 generated</em>", { x: W - x0 - 600, w: 600, y: py + 54, size: 31, font: "mono", weight: 500, ls: 0, align: "right", color: "rgba(244,243,236,0.72)", ...o, z: 31 });
    R.box("tlRuler", { x: x0, y: y0 - 44, w: wAll, h: 12 }, { bg: `repeating-linear-gradient(90deg, rgba(244,243,236,0.38) 0 2px, transparent 2px ${pps}px)`, ...o, z: 31 });
    let x = x0;
    reel.forEach((r, i) => {
      const len = Math.min(r.to - r.from, VEND - starts[i]);
      const bw = len * pps - gap;
      const n = Math.max(2, Math.round(bw / 110));
      for (let j = 0; j < n; j++) {
        R.media(`tl${i}_${j}`, r.clip, r.from + ((j + 0.5) / n) * len, { x: x + (j * bw) / n, y: y0, w: bw / n + 0.6, h: th }, { ...o, z: 31 });
      }
      const inside = V >= starts[i] && V < starts[i] + len;
      R.box(`tlb${i}`, { x, y: y0, w: bw, h: th }, { radius: 10, border: r.ai ? `4px solid ${LIME}` : "2px solid rgba(244,243,236,0.3)",
        bg: r.ai && inside ? `${LIME}38` : "transparent", ...o, z: 32 });
      const chip = r.ai ? "AI" : r.label;
      R.box(`tlc${i}`, { x: x + 8, y: y0 + 8, w: r.ai ? 64 : Math.min(bw - 16, chip.length * 13.6 + 20), h: 38 }, { radius: 7,
        bg: r.ai ? LIME : "rgba(10,10,9,0.66)", color: r.ai ? "#10140a" : "rgba(244,243,236,0.94)", font: `${r.ai ? 800 : 600} ${r.ai ? 25 : 21}px ${R.MONO}`, ls: 0,
        html: chip, ...o, s: r.ai && inside ? 1.14 : 1, origin: "0% 0%", z: 33 });
      x += bw + gap;
    });
    const hx = x0 + V * pps;
    R.box("tlHead", { x: hx - 2, y: y0 - 58, w: 4, h: th + 74 }, { bg: "#fff", radius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)", ...o, z: 35 });
    R.box("tlHeadCap", { x: hx - 12, y: y0 - 70, w: 24, h: 18 }, { bg: "#fff", radius: 5, ...o, z: 35 });
  }
  const copy = () => R.copy;

  window.timeline = function (t) {
    const c = copy();
    // 6 s bumper: the hook, the plunge and the breach into the barrel, then the offer over the barrel.
    if (S.mode === "bumper") {
      const speed = Math.abs(warp(t + 1 / 60) - warp(t - 1 / 60)) * 30;
      const { name, src } = clipAt(warp(t));
      R.media("reel", name, src, { x: 0, y: 0, w: W, h: H }, { vblur: clamp((speed - 2.3) * 4.5, 0, 18), z: 1 });
      cap("capHook", c.hook1, t, 0, T.breach, 420);
      cap("capZero", c.hook2, t, T.breach, S.ctaBeat * B, 420);
      cap("capEnd", c.cta, t, S.ctaBeat * B, 1e9, 420);
      return;
    }
    if (t < T.app) {
      const V = reelPos(t);
      const speed = Math.abs(reelPos(t + 1 / 60) - reelPos(t - 1 / 60)) * 30;
      const { name, src } = clipAt(V);
      const freeze = E.outCubic(prog(t, T.peak, T.rw0)) * (1 - E.inOutCubic(prog(t, T.rw0, T.rw0 + 0.3)));
      const rw = t > T.rw0 ? 1 : 0;
      R.media("reel", name, src, { x: 0, y: 0, w: W, h: H }, { vblur: clamp((speed - 2.3) * 4.5, 0, 18), s: 1 + 0.045 * freeze,
        bright: rw ? 0.78 : 1, sat: rw ? 0.88 : 1, z: 1 });
      cap("capHook", c.hook1, t, 0, T.breach, 420);
      cap("capZero", c.hook2, t, T.breach, T.zero, 420);
      if (t >= T.rw0) {
        strip(t, V);
        cap("capReveal", c.reveal, t, T.rw0 + 0.08, T.app, 420);
      }
      return;
    }
    // Ending: back to the footage (the breach into the barrel) under the offer.
    if (t >= T.fin) {
      const { name, src } = clipAt(FIN_V + (t - T.fin));
      R.media("reel", name, src, { x: 0, y: 0, w: W, h: H }, { z: 1 });
      cap("capEnd", c.cta, t, T.fin, 1e9, 420);
      return;
    }
    // The app, as a screen recording: upload screen, then the recommendations for these exact clips.
    const rec = t >= T.rec;
    const sc = W / S.uiSize[0], hImg = S.uiSize[1] * sc;
    const [a, b] = rec ? S.uiScroll.rec : S.uiScroll.upload;
    const off = lerp(a, b, E.inOutCubic(rec ? prog(t, T.rec + 0.12, T.rec + 0.95) : prog(t, T.app + 0.22, T.rec - 0.02)));
    R.media("ui", rec ? "img:uiRec" : "img:uiUpload", 0, { x: 0, y: -off, w: W, h: hImg }, { z: 10 });
    cap("capApp", c.app, t, T.app, T.rec, 360);
    cap("capRec", c.rec, t, T.rec, T.fin, 360);
  };
})();
