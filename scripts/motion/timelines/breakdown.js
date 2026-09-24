/*
 * Clipmelt UGC "breakdown" (vertical): a first-person creator ad built on one real Clipmelt result.
 *   1. split screen: the two unrelated input clips, "nothing in common"
 *   2. the result at full speed, with REAL / AI chips
 *   3. a quick rewind into slow motion (an interpolated clip), with a HUD: speed badge, source timecode, a
 *      REAL | AI | REAL scrub bar and callouts that walk through what the AI generated
 *   4. an analysis card: what Clipmelt matched between the clips
 *   5. the TikTok-style end sting (R.outro)
 * Spec: clips.full (the result) and clips.slow (the transition, interpolated), marks {split, play, rewind, slow,
 * card, outro} in seconds, splitA/splitB [from] source times, play [from, to], slow [from, to] source range of
 * clips.slow, ai [from, to] source times of the generated shot, callouts [{text, from, to}] in source seconds,
 * captions [{text, from, to, cy}] in timeline seconds, card {title, rows [[k, v]], footer}, copy {brand, url, outroLine}.
 */
(function () {
  const R = window.R, S = R.S;
  const { W, H, E, prog, lerp, clamp, LIME } = R;
  const M = S.marks;
  const [aiFrom, aiTo] = S.ai;

  const capHtml = (s) => `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em;` +
    `-webkit-box-decoration-break:clone;box-decoration-break:clone">${s}</span>`;
  function cap(id, s, t, t0, t1, cy, fade = 0.12) {
    if (t < t0 || t >= t1) return;
    const p = E.outCubic(prog(t, t0, t0 + fade)), size = 56;
    R.text(id, capHtml(s), { x: 70, w: W - 140, cy, size, weight: 700, lh: 1.5, ls: -0.012, wrap: true, s: 0.94 + 0.06 * p, opacity: clamp(p * 2), z: 60 });
  }
  const chip = (id, html, y, lime, op = 1) => R.box(id, { x: 44, y, w: Math.max(220, html.length * 16.5 + 60), h: 60 }, {
    bg: lime ? LIME : "rgba(12,12,11,0.62)", radius: 12, color: lime ? "#10140a" : "#f4f3ec", font: `700 26px ${R.MONO}`, ls: 0.04, html, opacity: op, z: 55 });
  function corners(op) {
    const m = 38, L = 112, th = 9;
    const c = (id, x, y, sides) => R.box(id, { x, y, w: L, h: L }, { css: Object.fromEntries(sides.map((sd) => [`border${sd}`, `${th}px solid ${LIME}`])), opacity: op, z: 54 });
    c("vfTL", m, m, ["Top", "Left"]); c("vfTR", W - m - L, m, ["Top", "Right"]);
    c("vfBL", m, H - m - L, ["Bottom", "Left"]); c("vfBR", W - m - L, H - m - L, ["Bottom", "Right"]);
  }
  const fmt = (s) => `00:${s.toFixed(2).padStart(5, "0")}`;

  window.timeline = function (t) {
    const c = R.copy;
    if (t >= M.outro) { R.outro(t - M.outro, { brand: c.brand, url: c.url, line: c.outroLine }); return; }

    if (t < M.play) {
      // 1. The two inputs, stacked.
      const u = t - M.split, k = E.outCubic(prog(u, 0, 0.35));
      R.media("splitA", "full", S.splitA + u, { x: 0, y: 0, w: W, h: H / 2 - 4 }, { z: 2, tx: (1 - k) * -W * 0.15 });
      R.media("splitB", "full", S.splitB + u, { x: 0, y: H / 2 + 4, w: W, h: H / 2 - 4 }, { z: 2, tx: (1 - k) * W * 0.15 });
      R.box("splitLine", { x: 0, y: H / 2 - 4, w: W, h: 8 }, { bg: "#000", z: 3 });
      chip("chipA", "CLIP 1 · COASTER POV", 150, false, k);
      chip("chipB", "CLIP 2 · CARTOON", H / 2 + 70, false, k);
    } else if (t < M.rewind) {
      // 2. The result, real time.
      const src = S.play[0] + (t - M.play);
      R.media("main", "full", Math.min(src, S.play[1]), { x: 0, y: 0, w: W, h: H }, { z: 1 });
      const ai = src >= aiFrom && src < aiTo;
      if (ai) { chip("chipAi", `${c.brand.toUpperCase()} · AI TRANSITION`, 236, true); corners(1); }
      else chip("chipReal", src < aiFrom ? "REAL CLIP 1" : "REAL CLIP 2", 236, false);
    } else if (t < M.card) {
      // 3. Rewind flash, then slow motion.
      const [s0, s1] = S.slow;
      const slowing = t >= M.slow;
      const src = slowing ? lerp(s0, s1, prog(t, M.slow, M.card)) : lerp(S.play[1], s0, E.inOutCubic(prog(t, M.rewind, M.slow)));
      const clip = slowing ? "slow" : "full";
      const at = slowing ? src - s0 : src;
      R.media("main", clip, at, { x: 0, y: 0, w: W, h: H }, { z: 1, vblur: slowing ? 0 : 10 });
      if (!slowing) R.box("rwFlash", { x: 0, y: 0, w: W, h: H }, { bg: "#fff", opacity: 0.35 * (1 - prog(t, M.rewind, M.slow)), z: 5 });
      const ai = src >= aiFrom && src < aiTo;
      const hudOp = slowing ? E.outCubic(prog(t, M.slow, M.slow + 0.25)) : 0;
      // HUD: speed badge + source timecode, top.
      R.box("hudSpeed", { x: 44, y: 150, w: 250, h: 64 }, { bg: slowing ? "#ff2e88" : "rgba(12,12,11,0.7)", radius: 12, color: "#fff", font: `800 30px ${R.MONO}`,
        html: slowing ? "0.3× SLOW-MO" : "◀◀ REWIND", opacity: slowing ? hudOp : 1, z: 55 });
      R.box("hudTc", { x: W - 44 - 250, y: 150, w: 250, h: 64 }, { bg: "rgba(12,12,11,0.7)", radius: 12, color: "#f4f3ec", font: `700 28px ${R.MONO}`,
        html: fmt(src), opacity: hudOp, z: 55 });
      if (slowing) {
        chip(ai ? "chipAi" : "chipReal", ai ? `${c.brand.toUpperCase()} · AI TRANSITION` : src < aiFrom ? "REAL CLIP 1" : "REAL CLIP 2", 236, ai, hudOp);
        if (ai) corners(hudOp);
        // Scrub bar: REAL | AI | REAL across the slowed range, with a playhead.
        const bx = 70, bw = W - 140, by = 1300, span = s1 - s0, xs = (v) => bx + ((v - s0) / span) * bw;
        R.box("barA", { x: bx, y: by, w: xs(aiFrom) - bx, h: 14 }, { bg: "rgba(244,243,236,0.55)", radius: 7, opacity: hudOp, z: 55 });
        R.box("barAi", { x: xs(aiFrom), y: by, w: xs(aiTo) - xs(aiFrom), h: 14 }, { bg: LIME, radius: 7, opacity: hudOp, z: 55 });
        R.box("barB", { x: xs(aiTo), y: by, w: bx + bw - xs(aiTo), h: 14 }, { bg: "rgba(244,243,236,0.55)", radius: 7, opacity: hudOp, z: 55 });
        R.box("barHead", { x: xs(src) - 5, y: by - 14, w: 10, h: 42 }, { bg: "#fff", radius: 5, boxShadow: "0 0 18px rgba(0,0,0,0.6)", opacity: hudOp, z: 56 });
        const lab = (id, x, s, col) => R.box(id, { x: x - 90, y: by + 26, w: 180, h: 36 }, { color: col, font: `700 22px ${R.MONO}`, ls: 0.05, html: s, opacity: hudOp, z: 55 });
        lab("labA", (bx + xs(aiFrom)) / 2, "REAL", "#f4f3ec");
        lab("labAi", (xs(aiFrom) + xs(aiTo)) / 2, "AI", LIME);
        lab("labB", (xs(aiTo) + bx + bw) / 2, "REAL", "#f4f3ec");
        (S.callouts || []).forEach((k, j) => cap(`call${j}`, k.text, src, k.from, k.to, 520, 0.035));
      }
    } else {
      // 4. What Clipmelt matched: a card over the dimmed last slow frame.
      const u = t - M.card, k = E.outCubic(prog(u, 0, 0.35));
      R.media("main", "slow", S.slow[1] - S.slow[0] - 0.02, { x: 0, y: 0, w: W, h: H }, { z: 1 });
      R.box("dim", { x: 0, y: 0, w: W, h: H }, { bg: "rgba(8,8,7,0.86)", z: 2 });
      const card = S.card, rows = card.rows.map(([a, b], j) => {
        const on = u >= 0.35 + j * 0.42;
        return `<div style="display:flex;justify-content:space-between;gap:24px;padding:22px 0;border-top:1px solid rgba(244,243,236,0.16);opacity:${on ? 1 : 0.15}">` +
          `<span style="font:600 32px ${R.MONO};color:#b9bba9;letter-spacing:0.04em">${a}</span>` +
          `<span style="font:700 50px ${R.FONT};color:${j === card.rows.length - 1 ? LIME : "#f4f3ec"};text-align:right">${b}</span></div>`;
      }).join("");
      R.text("card", `<div style="text-align:left;background:#121310;border:1px solid rgba(217,252,105,0.35);border-radius:28px;padding:44px 48px 36px">` +
        `<div style="font:700 34px ${R.MONO};color:${LIME};letter-spacing:0.06em;margin-bottom:22px">${card.title}</div>${rows}` +
        `<div style="font:600 38px ${R.FONT};color:#e8e8dc;line-height:1.3;margin-top:30px">${card.footer}</div></div>`,
        { x: 56, w: W - 112, cy: H * 0.45, size: 30, align: "left", lh: 1.2, s: lerp(0.94, 1, k), opacity: k, z: 20 });
    }
    if (c.url) {
      const w = c.url.length * 18.2 + 110;
      R.box("urlPill", { x: (W - w) / 2, y: 1500, w, h: 78 }, { bg: "rgba(12,12,11,0.74)", radius: 39, border: "1px solid rgba(244,243,236,0.24)", color: "#f4f3ec",
        font: `700 31px ${R.MONO}`, ls: 0, html: `<span style="display:inline-block;width:14px;height:14px;border-radius:7px;background:${LIME};margin-right:16px"></span>${c.url}`, z: 58 });
    }
    (S.captions || []).forEach((k, j) => cap(`cap${j}`, k.text, t, k.from, k.to, k.cy ?? 420));
  };
})();
