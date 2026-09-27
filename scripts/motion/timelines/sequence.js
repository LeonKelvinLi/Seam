/*
 * Clipmelt "Two clips, one tap" (vertical): a list of shots played back to back, in the spirit of the command → result
 * loops of AI-tool launch films, with our own cast of pieces:
 *   title  { lines: [a, b] }                               kinetic title on black
 *   life   { clip, from, idea }                            a real lifestyle shot with an idea chip ("skateboard → BMX")
 *   app    { clip, badgeUntil }                            the real studio session, condensed, in a phone frame
 *   flash  { caption }                                     a generic keyframe timeline: the old way
 *   result { clip, from, to, ai: [a, b] }                  a real Clipmelt result; REAL / AI chips follow the source time
 *   inset  { clip, from, to, ai, a, aAt, b, bAt, text }    the result full screen, both input clips pinned small with labels
 *   pair   { a, aFrom, b, bFrom, text }                    the two raw inputs stacked, playing
 *   outro  {}                                              the TikTok-style end sting (R.outro)
 * Every shot has t0/t1 in seconds (S.shots). copy.{brand,url,outroLine}.
 */
(function () {
  const R = window.R, S = R.S;
  const { W, H, E, prog, lerp, clamp, LIME } = R;

  const chip = (id, html, lime, op = 1, y = 300) => R.box(id, { x: 65, y, w: Math.max(220, html.length * 16.5 + 60), h: 60 }, {
    bg: lime ? LIME : "rgba(12,12,11,0.62)", radius: 12, color: lime ? "#10140a" : "#f4f3ec", font: `700 26px ${R.MONO}`, ls: 0.04, html, opacity: op, z: 55 });
  function corners(op) {
    const m = 38, L = 112, th = 9;
    const c = (id, x, y, sides) => R.box(id, { x, y, w: L, h: L }, { css: Object.fromEntries(sides.map((sd) => [`border${sd}`, `${th}px solid ${LIME}`])), opacity: op, z: 54 });
    c("vfTL", m, m, ["Top", "Left"]); c("vfTR", W - m - L, m, ["Top", "Right"]);
    c("vfBL", m, H - m - L, ["Bottom", "Left"]); c("vfBR", W - m - L, H - m - L, ["Bottom", "Right"]);
  }

  function title(s, u) {
    R.box("tBg", { x: 0, y: 0, w: W, h: H }, { bg: "#0b0b0a", z: 1 });
    const k1 = E.outCubic(prog(u, 0.05, 0.45)), k2 = E.outCubic(prog(u, 0.35, 0.8));
    R.media("tMark", "img:mark", 0, { x: W / 2 - 70, y: 560, w: 140, h: 140 }, { opacity: k1, z: 3 });
    R.text("t1", s.lines[0], { x: 60, w: W - 120, cy: 860, size: 104, weight: 800, ls: -0.04, color: "#f4f3ec", opacity: k1, s: lerp(0.9, 1, k1), z: 3 });
    R.text("t2", s.lines[1], { x: 60, w: W - 120, cy: 990, size: 76, weight: 800, ls: -0.035, color: LIME, opacity: k2, tx: (1 - k2) * 40, z: 3 });
  }

  function life(s, u) {
    R.media("life", s.clip, s.from + u, { x: 0, y: 0, w: W, h: H }, { z: 1, imgScale: lerp(1.02, 1.08, u / (s.t1 - s.t0)) });
    const k = E.outBack(prog(u, 0.15, 0.5));
    R.text("idea", `<span style="display:inline-flex;align-items:center;gap:18px;background:rgba(12,12,11,0.72);border:1.5px solid rgba(217,252,105,0.6);` +
      `border-radius:999px;padding:18px 34px 20px"><span style="color:${LIME};font-size:40px">✦</span><span>${s.idea}</span></span>`,
      { x: 60, w: W - 120, cy: 1080, size: 50, weight: 700, ls: -0.01, color: "#f4f3ec", opacity: clamp(k * 1.5), s: lerp(0.85, 1, k), z: 20 });
  }

  function app(s, u) {
    R.box("aBg", { x: 0, y: 0, w: W, h: H }, { bg: "#0d0e10", z: 1 });
    const pw = 800, ph = pw * (1688 / 780), px = (W - pw) / 2, py = (H - ph) / 2 + 20;
    R.media("app", s.clip, u, { x: px, y: py, w: pw, h: ph }, { z: 2, radius: 54, border: "12px solid #232428", boxShadow: "0 40px 100px rgba(0,0,0,0.7)" });
    if (u < s.badgeUntil) R.box("sped", { x: W - 65 - 220, y: 70, w: 220, h: 60 }, { bg: "rgba(12,12,11,0.85)", border: "1px solid rgba(244,243,236,0.25)", radius: 30,
      color: "#f4f3ec", font: `700 26px ${R.MONO}`, html: "⏩ sped up", z: 55 });
    R.box("real", { x: 65, y: 70, w: 330, h: 60 }, { bg: "rgba(12,12,11,0.85)", border: "1px solid rgba(244,243,236,0.25)", radius: 30,
      color: "#f4f3ec", font: `700 24px ${R.MONO}`, html: "● real screen recording", z: 55 });
  }

  function flash(s, u) {
    R.box("gyBg", { x: 0, y: 0, w: W, h: H }, { bg: "#16171a", z: 10 });
    const rows = 16, cols = 34, fill = clamp(u / ((s.t1 - s.t0) * 0.8));
    let html = "";
    for (let r = 0; r < rows; r++) {
      html += `<div style="position:absolute;left:0;right:0;top:${r * 64}px;height:56px;background:${r % 2 ? "#1d1f23" : "#191b1f"}">`;
      for (let c = 0; c < cols; c++) {
        if ((c * 7 + r * 13) % 5 === 0 || c / cols > fill) continue;
        html += `<i style="position:absolute;left:${20 + c * 30 + ((r * 11) % 9)}px;top:17px;width:14px;height:14px;transform:rotate(45deg);background:${r % 3 ? "#f2c14e" : "#6fa8ff"}"></i>`;
      }
      html += "</div>";
    }
    R.text("gyRows", `<div style="position:relative;height:${rows * 64}px">${html}</div>`, { x: 0, w: W, y: 560, size: 10, z: 11 });
    R.text("gyCap", s.caption, { x: 70, w: W - 140, cy: 400, size: 60, weight: 800, lh: 1.15, ls: -0.02, color: "#f4f3ec", wrap: true, z: 12 });
  }

  function result(s, u) {
    const src = lerp(s.from, s.to, u / (s.t1 - s.t0));
    R.media("res", s.clip, src, { x: 0, y: 0, w: W, h: H }, { z: 1 });
    const ai = src >= s.ai[0] && src < s.ai[1];
    chip(ai ? "chipAi" : "chipReal", ai ? `${R.copy.brand.toUpperCase()} · AI TRANSITION` : src < s.ai[0] ? "REAL CLIP" : "REAL CLIP", ai, 1);
    if (ai) corners(1);
    const url = R.copy.url, w = url.length * 18.2 + 110;
    R.box("urlPill", { x: (W - w) / 2, y: 1180, w, h: 78 }, { bg: "rgba(12,12,11,0.74)", radius: 39, border: "1px solid rgba(244,243,236,0.24)", color: "#f4f3ec",
      font: `700 31px ${R.MONO}`, ls: 0, html: `<span style="display:inline-block;width:14px;height:14px;border-radius:7px;background:${LIME};margin-right:16px"></span>${url}`, z: 46 });
  }

  /** Payoff first: the result plays full screen while the two clips it was made from sit in the corner. */
  function inset(s, u) {
    result(s, u);
    const k = E.outBack(prog(u, 0.05, 0.45)), w = 230, h = 410, x = W - 65 - w;
    const thumb = (id, clip, t, y, label) => {
      R.media(id, clip, t, { x, y: y + (1 - k) * 40, w, h }, { z: 50, radius: 22, opacity: clamp(k * 1.4), border: "4px solid #f4f3ec", boxShadow: "0 16px 40px rgba(0,0,0,0.55)" });
      R.box(`${id}L`, { x: x + 14, y: y + h - 58, w: 150, h: 44 }, { bg: "rgba(12,12,11,0.8)", radius: 22, color: "#f4f3ec", font: `700 22px ${R.MONO}`, html: label, opacity: clamp(k * 1.4), z: 51 });
    };
    thumb("inA", s.a, s.aAt, 380, "CLIP 1");
    thumb("inB", s.b, s.bAt, 380 + h + 24, "CLIP 2");
    R.text("insetTxt", s.text, { x: 65, w: W - 65 - w - 90, y: 560, size: 92, weight: 800, lh: 1.02, ls: -0.04, color: "#fff", align: "left", wrap: true,
      shadow: "0 4px 30px rgba(0,0,0,0.6)", opacity: clamp(k * 1.5), z: 52 });
  }

  /** The inputs, nothing else: clip 1 on top, clip 2 below. */
  function pair(s, u) {
    R.media("pA", s.a, s.aFrom + u, { x: 0, y: 0, w: W, h: H / 2 - 4 }, { z: 2 });
    R.media("pB", s.b, s.bFrom + u, { x: 0, y: H / 2 + 4, w: W, h: H / 2 - 4 }, { z: 2 });
    R.box("pLine", { x: 0, y: H / 2 - 4, w: W, h: 8 }, { bg: "#000", z: 3 });
    chip("pChipA", "CLIP 1 · REAL", false, 1, 150);
    chip("pChipB", "CLIP 2 · REAL", false, 1, H / 2 + 70);
    R.text("pTxt", `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em">${s.text}</span>`,
      { x: 70, w: W - 140, cy: H / 2, size: 60, weight: 800, lh: 1.4, ls: -0.015, wrap: true, z: 20 });
  }

  const draw = { title, life, app, flash, result, inset, pair };
  window.timeline = function (t) {
    const s = S.shots.find((x) => t >= x.t0 && t < x.t1) ?? S.shots[S.shots.length - 1];
    if (s.type === "outro") { R.outro(t - s.t0, { brand: R.copy.brand, url: R.copy.url, line: R.copy.outroLine }); return; }
    draw[s.type](s, t - s.t0);
  };
})();
