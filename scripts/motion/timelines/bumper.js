/*
 * Clipmelt 6 s bumper (vertical), reverse-engineered from Higgsfield's 6 s YouTube bumper:
 *   one hero shot -> claim on the drop -> "living grid" of results under the CTA -> logo lockup.
 * Beat grid B = 0.44 s; the music drop lands on the claim at 2 beats.
 */
window.timeline = function (t, R) {
  const { W, H, E, prog, lerp, clamp, span, media, card, text, box, orb, LIME, copy } = R;
  const B = R.beat;
  const T = { claim: 2 * B, punch: 4.5 * B, grid: 5 * B, lock: 11 * B };
  const cx = W / 2, cy = H / 2;
  box("bg", { x: 0, y: 0, w: W, h: H }, { bg: `radial-gradient(120% 90% at 50% 45%, #15170f 0%, #0b0b0a 55%, #060606 100%)`, z: 0 });

  // Hero shot: television portal into the barrel wave.
  if (t < T.claim) {
    const src = span(t, 0, T.claim, 0.9, 3.4);
    media("hero-fill", "tv", src, { x: -W * 0.9, y: 0, w: W * 2.8, h: H }, { blur: 38, bright: 0.42, sat: 1.25, z: 1 });
    const bw = W * 1.26, bh = bw * 9 / 16;
    media("hero", "tv", src, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, { s: 1.02 + 0.08 * prog(t, 0, T.claim), z: 2, boxShadow: "0 40px 120px rgba(0,0,0,0.7)" });
  }

  // Claim on the drop.
  if (t >= T.claim && t < T.grid + 0.15) {
    const punch = E.inExpo(prog(t, T.punch, T.grid));
    const lines = copy.claimV || ["TWO CLIPS.", "ONE <em>IMPOSSIBLE</em>", "SHOT."];
    lines.forEach((l, i) => {
      const d = E.outExpo(prog(t, T.claim + i * 0.05, T.claim + i * 0.05 + 0.26));
      text(`claim${i}`, l, { x: 30, w: W - 60, cy: cy - 215 + i * 215, size: i === 1 ? 150 : 200, fitW: W - 70, weight: 900, s: lerp(1.3, 1, d) * lerp(1, 3.2, punch),
        blur: (1 - d) * 14 + punch * 24, opacity: clamp(d * 1.4) * (1 - prog(t, T.grid - 0.06, T.grid + 0.06)), z: 6, origin: `50% ${50 + (1 - i) * 90}%` });
    });
    const sweep = E.inOutCubic(prog(t, T.claim, T.punch));
    const grow = E.inExpo(prog(t, T.punch, T.grid + 0.12));
    orb("orb", lerp(-W * 0.12, cx, sweep), cy, lerp(70, Math.hypot(W, H) * 0.62, grow), { z: 5, opacity: 1 - prog(t, T.grid + 0.02, T.grid + 0.15) });
  }

  // Living grid: 2 x 3 square tiles, each swapping to a new result every 2 beats, staggered.
  if (t >= T.grid) {
    const pool = R.S.pool;
    const size = 500, gap = 20, gx = cx - size - gap / 2, gy = cy - (3 * size + 2 * gap) / 2 - 40;
    const dim = E.inOutCubic(prog(t, T.lock - 0.2, T.lock + 0.25));
    for (let k = 0; k < 6; k++) {
      const col = k % 2, row = Math.floor(k / 2);
      const stagger = (row * 2 + col) * 0.07;
      const local = t - T.grid - stagger;
      const n = Math.max(0, Math.floor(local / (2 * B)));
      const item = pool[(k * 2 + n * 5) % pool.length];
      const segA = T.grid + stagger + n * 2 * B;
      const pop = E.outBack(prog(t, segA, segA + 0.22));
      const src = span(t, segA, segA + 2 * B, item.from, item.to);
      card(`tile${k}`, item.clip, src, { x: gx + col * (size + gap), y: gy + row * (size + gap), w: size, h: size },
        { radius: 26, s: (local < 0 ? 0 : lerp(0.86, 1, pop)) * lerp(1, 0.96, dim), opacity: local < 0 ? 0 : clamp(pop * 1.3), bright: lerp(1, 0.28, dim), blur: dim * 5,
          label: item.label, labelSize: 24, labelOpacity: 1 - dim, z: 3 });
    }
    // CTA across the grid, as in the Higgsfield bumper.
    const c = E.outBack(prog(t, T.grid + 0.35, T.grid + 0.65)) * (1 - dim);
    box("ctaBand", { x: 0, y: cy - 150 - 40, w: W, h: 300 }, { bg: "linear-gradient(180deg, transparent, rgba(6,6,6,0.72) 30%, rgba(6,6,6,0.72) 70%, transparent)", opacity: clamp(c), z: 8 });
    text("cta1", copy.cta1 || "TRY 3 FREE ON", { x: 0, w: W, cy: cy - 40 - 50, size: 52, weight: 800, ls: -0.02, s: c, opacity: clamp(c), shadow: "0 6px 30px rgba(0,0,0,0.7)", z: 9 });
    text("cta2", copy.cta2 || "CLIPMELT", { x: 0, w: W, cy: cy - 40 + 38, size: 124, weight: 900, color: LIME, ls: -0.035, s: c, opacity: clamp(c), shadow: "0 8px 40px rgba(0,0,0,0.75)", z: 9 });
    // Logo lockup.
    if (t >= T.lock - 0.1) {
      const k = (d) => E.outBack(prog(t, T.lock + d, T.lock + d + 0.34));
      box("lockGlow", { x: cx - 520, y: cy - 330 - 520, w: 1040, h: 1040 }, { bg: `radial-gradient(circle, ${LIME}33 0%, ${LIME}10 38%, transparent 66%)`, radius: 520, opacity: clamp(k(0)), z: 10 });
      media("mark", "img:mark", 0, { x: cx - 150, y: cy - 330 - 150, w: 300, h: 300 }, { fit: "contain", s: k(0), opacity: clamp(k(0)), dropShadow: `drop-shadow(0 0 28px ${LIME}88)`, z: 11 });
      text("word", copy.brand || "Clipmelt", { x: 0, w: W, cy: cy - 60, size: 170, weight: 800, ls: -0.045, s: k(0.07), opacity: clamp(k(0.07)), z: 11 });
      box("pill", { x: cx - 290, y: cy + 90, w: 580, h: 124 }, { bg: LIME, radius: 70, color: "#10140a", font: `800 50px ${R.FONT}`, ls: -0.02, html: copy.pill || "Try it free &nbsp;→",
        s: k(0.16), opacity: clamp(k(0.16)), boxShadow: `0 20px 60px ${LIME}40`, z: 11 });
    }
  }
};
