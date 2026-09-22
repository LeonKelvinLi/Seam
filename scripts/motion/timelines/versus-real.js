/*
 * Clipmelt v2 "versus" (vertical), real footage: the same two clips side by side, a plain crossfade on the left and
 * the Clipmelt bridge on the right, both starting on the same frame. The right panel is speed-ramped through the long
 * underwater / spray stretches (as in the creator cut) so its transition lands while the crossfade is still on screen.
 * After two pairs the right panel takes the screen and plays on under the offer. Native caption boxes, no brand motifs.
 * S.pairs: [{ xf, xfStart, rate, name, right: [[pairTime, reelPos], ...] }]; S.ending: [reelFrom, reelTo]; S.reel as in the creator cut.
 */
(function () {
  const R = window.R, S = R.S, B = R.beat;
  const { W, H, E, prog, lerp, clamp } = R;
  const PAIR = 10 * B, END = S.pairs.length * PAIR;
  const reel = S.reel, starts = [];
  let acc = 0;
  for (const r of reel) { starts.push(acc); acc += r.to - r.from; }
  const ramps = S.pairs.map((p) => R.monotone(p.right));
  function clipAt(V) {
    let i = reel.length - 1;
    while (i > 0 && V < starts[i]) i--;
    return { name: reel[i].clip, src: Math.min(reel[i].to, reel[i].from + (V - starts[i])) };
  }
  const capHtml = (s) => `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em;` +
    `-webkit-box-decoration-break:clone;box-decoration-break:clone">${s}</span>`;
  function cap(id, s, t, t0, t1, cy, size = 56, opacity = 1) {
    if (t < t0 || t >= t1) return;
    const p = t0 <= 0 ? 1 : E.outCubic(prog(t, t0, t0 + 0.1));
    R.text(id, capHtml(s), { x: 40, w: W - 80, cy, size, weight: 700, lh: 1.5, ls: -0.012, wrap: true, s: 0.94 + 0.06 * p, opacity: clamp(p * 2) * opacity, z: 40 });
  }

  window.timeline = function (t) {
    const c = R.copy;
    R.box("bg", { x: 0, y: 0, w: W, h: H }, { bg: "#0b0b0a", z: 0 });
    const pw = 516, ph = Math.round(pw * 16 / 9), gap = 16, py = 590;
    const L = { x: (W - 2 * pw - gap) / 2, y: py, w: pw, h: ph }, Rt = { x: L.x + pw + gap, y: py, w: pw, h: ph };
    const i = Math.min(S.pairs.length - 1, Math.floor(t / PAIR));
    const p = S.pairs[i];
    const lt = Math.min(t, END) - i * PAIR;
    const k = E.inOutCubic(prog(t, END, END + 0.4)); // right panel takes the screen
    const tail = Math.max(0, t - END);
    const u = p.xfStart + lt * p.rate;
    const V = t < END ? ramps[i](lt) : lerp(S.ending[0], S.ending[1], clamp(tail / (R.S.duration - END)));
    if (k < 1) R.media("left", p.xf, u, L, { radius: 18, opacity: 1 - k, z: 2 });
    const { name, src } = clipAt(V);
    R.media("right", name, src, { x: lerp(Rt.x, 0, k), y: lerp(Rt.y, 0, k), w: lerp(Rt.w, W, k), h: lerp(Rt.h, H, k) }, { radius: lerp(18, 0, k), z: 3 });
    const pre = 1 - k;
    if (pre > 0) {
      cap("title", c.title, t, 0, END, 300, 54, pre);
      R.text("labL", capHtml(c.labelLeft), { x: L.x - 20, w: pw + 40, cy: py - 50, size: 42, weight: 700, lh: 1.5, ls: -0.012, opacity: pre, z: 40 });
      R.text("labR", capHtml(c.labelRight), { x: Rt.x - 20, w: pw + 40, cy: py - 50, size: 42, weight: 700, lh: 1.5, ls: -0.012, opacity: pre, z: 40 });
      R.text("pairName", p.name, { x: 0, w: W, cy: py + ph + 58, size: 30, font: "mono", weight: 500, ls: 0, color: "rgba(244,243,236,0.62)",
        opacity: pre * clamp(prog(lt, 0.02, 0.2)), z: 5 });
    }
    cap("end", c.cta, t, END + 0.3, 1e9, 420);
  };
})();
