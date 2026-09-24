/*
 * Clipmelt v3 "chain" (vertical): a real-footage one-take through several clips where every join is an AI transition
 * that is meant to be noticed. Filmed footage carries a dark "REAL CLIP n/N" chip; while a generated transition plays,
 * a lime chip names it ("AI TRANSITION n/M" and the Clipmelt recipe) and lime viewfinder corners frame the shot.
 * Then the real app as a screen recording, and a TikTok-style end sting (R.outro). copy.url stays on screen as a
 * bottom pill (clear of the platform buttons) until the sting, which repeats it.
 * Spec: reel [{ clip, from, to, ai?, style? }], warp [[beat, reelPos], ...], marks { app, rec, outro } in beats,
 * captions [{ text, from, to, cy }] in beats, uiScroll, uiSize, uiZoom, copy.{brand,url,outroLine}.
 */
(function () {
  const R = window.R, S = R.S, B = R.beat;
  const { W, H, E, prog, lerp, clamp, LIME } = R;
  const reel = S.reel, starts = [];
  let acc = 0;
  for (const r of reel) { starts.push(acc); acc += r.to - r.from; }
  const warp = R.monotone(S.warp.map(([b, v]) => [b * B, v]));
  const T = Object.fromEntries(Object.entries(S.marks).map(([k, v]) => [k, v * B]));
  const ONE_END = S.warp[S.warp.length - 1][0] * B;
  // Number the segments and find when the playhead enters each one (bisection on the monotone ramp).
  let nr = 0, na = 0;
  const seg = reel.map((r) => (r.ai ? { ai: true, n: ++na, style: r.style } : { ai: false, n: ++nr }));
  const enterT = starts.map((v) => {
    let a = 0, b = ONE_END;
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (warp(m) < v) a = m; else b = m; }
    return b;
  });
  const segAt = (V) => { let i = reel.length - 1; while (i > 0 && V < starts[i]) i--; return i; };

  const capHtml = (s) => `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em;` +
    `-webkit-box-decoration-break:clone;box-decoration-break:clone">${s}</span>`;
  function cap(id, s, t, t0, t1, cy) {
    if (t < t0 || t >= t1) return;
    const p = t0 <= 0 ? 1 : E.outCubic(prog(t, t0, t0 + 0.1));
    R.text(id, capHtml(s), { x: 70, w: W - 140, cy, size: 56, weight: 700, lh: 1.5, ls: -0.012, wrap: true, s: 0.94 + 0.06 * p, opacity: clamp(p * 2), z: 40 });
  }

  /** Segment chips; on generated shots also lime viewfinder corners that close in on the frame. */
  function chips(t, i) {
    const g = seg[i], k = E.outCubic(prog(t, enterT[i], enterT[i] + 0.18)), op = clamp(k * 1.6);
    if (!g.ai) {
      R.box("chipReal", { x: 44, y: 236, w: 262, h: 56 }, { bg: "rgba(12,12,11,0.6)", radius: 12, color: "#f4f3ec", font: `600 25px ${R.MONO}`, ls: 0.04,
        html: `REAL CLIP ${g.n}/${nr}`, opacity: op, tx: (1 - k) * -30, z: 45 });
      return;
    }
    R.text("chipAi", `<div style="display:inline-block;background:${LIME};color:#10140a;border-radius:16px;padding:12px 22px 15px;text-align:left">` +
      `<div style="font:700 28px ${R.MONO};letter-spacing:0.04em">${R.copy.brand ? `${R.copy.brand.toUpperCase()} · ` : ""}AI TRANSITION ${g.n}/${na}</div>` +
      `<div style="font:800 56px ${R.FONT};letter-spacing:-0.025em;margin-top:6px">${g.style}</div></div>`,
      { x: 44, w: W - 88, y: 230, size: 28, align: "left", lh: 1.1, tx: (1 - k) * -60, s: lerp(0.9, 1, E.outBack(prog(t, enterT[i], enterT[i] + 0.28))),
        origin: "0% 0%", opacity: op, z: 45 });
    const m = 38, L = 112, th = 9, s = lerp(1.06, 1, k);
    const corner = (id, x, y, sides) => R.box(id, { x, y, w: L, h: L }, { css: Object.fromEntries(sides.map((sd) => [`border${sd}`, `${th}px solid ${LIME}`])),
      opacity: op, s, origin: `${W / 2 - x}px ${H / 2 - y}px`, z: 44 });
    corner("vfTL", m, m, ["Top", "Left"]);
    corner("vfTR", W - m - L, m, ["Top", "Right"]);
    corner("vfBL", m, H - m - L, ["Bottom", "Left"]);
    corner("vfBR", W - m - L, H - m - L, ["Bottom", "Right"]);
  }

  window.timeline = function (t) {
    const c = R.copy;
    if (t >= T.outro) { R.outro(t - T.outro, { brand: c.brand, url: c.url, line: c.outroLine }); return; }
    if (t >= T.app) {
      // The app as a screen recording: upload screen, then the recommendations for the first pair.
      const rec = t >= T.rec;
      const z = S.uiZoom || 1, sc = (W * z) / S.uiSize[0], hImg = S.uiSize[1] * sc;
      const [a, b] = rec ? S.uiScroll.rec : S.uiScroll.upload;
      const off = lerp(a, b, E.inOutCubic(rec ? prog(t, T.rec + 0.1, T.outro - 0.1) : prog(t, T.app + 0.15, T.rec - 0.02)));
      R.media("ui", rec ? "img:uiRec" : "img:uiUpload", 0, { x: (W - W * z) / 2, y: -off, w: W * z, h: hImg }, { z: 10 });
    } else {
      const V = warp(Math.min(t, ONE_END));
      const i = segAt(V), r = reel[i];
      const speed = Math.abs(warp(t + 1 / 60) - warp(t - 1 / 60)) * 30;
      R.media("reel", r.clip, Math.min(r.to, r.from + (V - starts[i])), { x: 0, y: 0, w: W, h: H }, { vblur: clamp((speed - 2.6) * 4, 0, 14), z: 1 });
      chips(t, i);
    }
    if (c.url) {
      const w = c.url.length * 18.2 + 110;
      R.box("urlPill", { x: (W - w) / 2, y: 1392, w, h: 78 }, { bg: "rgba(12,12,11,0.74)", radius: 39, border: "1px solid rgba(244,243,236,0.24)", color: "#f4f3ec",
        font: `700 31px ${R.MONO}`, ls: 0, html: `<span style="display:inline-block;width:14px;height:14px;border-radius:7px;background:${LIME};margin-right:16px"></span>${c.url}`, z: 46 });
    }
    (S.captions || []).forEach((k, j) => cap(`cap${j}`, k.text, t, k.from * B, k.to * B, k.cy ?? 420));
  };
})();
