/*
 * Clipmelt master ad (15 s), reverse-engineered from Higgsfield's 15 s YouTube master:
 *   hook montage with accelerating cuts -> claim card on the drop -> proof -> labelled 3D carousel under a persistent CTA
 *   -> credibility parade -> hub -> glowing logo end card. One script lays out 16:9 and 9:16.
 * Beat grid: music starts on a downbeat, B = 0.44 s (136 BPM); the drop lands on the claim card at 6 beats.
 */
window.timeline = function (t, R) {
  const { W, H, E, prog, lerp, clamp, span, media, card, text, box, orb, streaks, LIME, copy } = R;
  const V = H > W;
  const B = R.beat;
  const T = { h2: 3 * B, h3: 4.5 * B, h4: 5.5 * B, claim: 6 * B, punch: 9.5 * B, how: 10 * B, merge: 12 * B, result: 13 * B,
    car: 18 * B, parade: 26 * B, hub: 28 * B, end: 30 * B };
  const cx = W / 2, cy = H / 2;

  // Background: near-black with a faint lime-tinted vignette so dark frames never read as empty.
  box("bg", { x: 0, y: 0, w: W, h: H }, { bg: `radial-gradient(120% 90% at 50% 45%, #15170f 0%, #0b0b0a 55%, #060606 100%)`, z: 0 });

  // ---------- 1. HOOK: four impossible transitions, cuts accelerating 1.32 / 0.66 / 0.44 / 0.22 s ----------
  if (t < T.claim) {
    const shots = [
      { a: 0, b: T.h2, clip: "plane", from: 0.9, to: 3.5 },
      { a: T.h2, b: T.h3, clip: "tv", from: 1.1, to: 3.2 },
      { a: T.h3, b: T.h4, clip: "eye", from: 3.0, to: 4.9 },
      { a: T.h4, b: T.claim, clip: "prism", from: 1.3, to: 2.6 },
    ];
    const s = shots.find((x) => t >= x.a && t < x.b) || shots[0];
    const k = prog(t, s.a, s.b);
    const src = span(t, s.a, s.b, s.from, s.to);
    const hit = s.a > 0 ? 1 - E.outCubic(prog(t, s.a, s.a + 0.14)) : 0; // impact zoom + flash on each cut
    const push = 1.02 + 0.07 * k + 0.1 * hit;
    if (V) {
      media("hook-fill", s.clip, src, { x: -W * 0.9, y: 0, w: W * 2.8, h: H }, { blur: 38, bright: 0.42, sat: 1.25, z: 1 });
      const bw = W * 1.26, bh = bw * 9 / 16;
      media("hook", s.clip, src, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, { s: push, bright: 1 + 0.35 * hit, z: 2,
        boxShadow: "0 40px 120px rgba(0,0,0,0.7)" });
    } else {
      media("hook", s.clip, src, { x: 0, y: 0, w: W, h: H }, { s: push, bright: 1 + 0.35 * hit, z: 2 });
    }
  }

  // ---------- 2. CLAIM on the drop, orb sweep, punch-in exit ----------
  if (t >= T.claim && t < T.how + 0.2) {
    const slam = E.outExpo(prog(t, T.claim, T.claim + 0.28));
    const punch = E.inExpo(prog(t, T.punch, T.how));
    const scale = lerp(1.28, 1, slam) * lerp(1, 3.4, punch);
    const blur = (1 - slam) * 14 + punch * 26;
    const op = clamp(slam * 1.4) * (1 - prog(t, T.how - 0.08, T.how + 0.05));
    if (V) {
      const lines = copy.claimV || ["TWO CLIPS.", "ONE <em>IMPOSSIBLE</em>", "SHOT."];
      lines.forEach((l, i) => {
        const d = E.outExpo(prog(t, T.claim + i * 0.05, T.claim + i * 0.05 + 0.28));
        text(`claim${i}`, l, { x: 30, w: W - 60, cy: cy - 230 + i * 215, size: i === 1 ? 150 : 200, fitW: W - 70, weight: 900, s: lerp(1.3, 1, d) * lerp(1, 3.4, punch),
          blur: (1 - d) * 14 + punch * 26, opacity: clamp(d * 1.4) * (1 - prog(t, T.how - 0.08, T.how + 0.05)), z: 6, origin: `50% ${50 + (1 - i) * 90}%` });
      });
      text("claimSub", copy.claimSub || "AI VIDEO TRANSITIONS", { x: 0, w: W, cy: cy + 400, size: 36, font: "mono", weight: 600, ls: 0.32, color: "rgba(244,243,236,0.72)",
        opacity: prog(t, T.claim + 0.25, T.claim + 0.5) * (1 - punch), z: 6 });
    } else {
      text("claim0", copy.claim1 || "TWO CLIPS.", { x: 0, w: W, cy: cy - 110, size: 210, fitW: W - 240, weight: 900, s: scale, blur, opacity: op, z: 6, origin: "50% 90%" });
      const d2 = E.outExpo(prog(t, T.claim + 0.06, T.claim + 0.34));
      text("claim1", copy.claim2 || "ONE <em>IMPOSSIBLE</em> SHOT.", { x: 0, w: W, cy: cy + 95, size: 132, fitW: W - 240, weight: 900, s: lerp(1.28, 1, d2) * lerp(1, 3.4, punch),
        blur: (1 - d2) * 14 + punch * 26, opacity: clamp(d2 * 1.4) * (1 - prog(t, T.how - 0.08, T.how + 0.05)), z: 6, origin: "50% 10%" });
      text("claimSub", copy.claimSub || "AI VIDEO TRANSITIONS", { x: 0, w: W, cy: cy + 235, size: 30, font: "mono", weight: 600, ls: 0.34, color: "rgba(244,243,236,0.72)",
        opacity: prog(t, T.claim + 0.25, T.claim + 0.5) * (1 - punch), z: 6 });
    }
    // Orb sweeps left to right behind the words, then grows into a lime wipe that opens the next scene.
    const sweep = E.inOutCubic(prog(t, T.claim, T.punch));
    const grow = E.inExpo(prog(t, T.punch, T.how + 0.18));
    const ox = lerp(-W * 0.12, cx, sweep), oy = V ? cy - 10 : cy + 10;
    const r = lerp(V ? 70 : 80, Math.hypot(W, H) * 0.62, grow);
    orb("orb", ox, oy, r, { z: 5, opacity: 1 - prog(t, T.how + 0.05, T.how + 0.2) });
  }

  // ---------- 3. HOW IT WORKS: clip A + clip B -> one seamless shot ----------
  if (t >= T.how && t < T.car + 0.1) {
    const fly = E.outExpo(prog(t, T.how, T.how + 0.44));
    const join = E.inOutCubic(prog(t, T.merge, T.result));
    const flash = t >= T.result ? 1 - E.outCubic(prog(t, T.result, T.result + 0.18)) : 0;
    if (t < T.result) {
      if (V) {
        const w = 900, h = w * 9 / 16;
        const ya = lerp(lerp(-600, 250, fly), cy - h / 2, join), yb = lerp(lerp(H + 600, H - 250 - h, fly), cy - h / 2, join);
        card("cardA", "doorA", t - T.how, { x: cx - w / 2, y: ya, w, h }, { persp: 1800, rx: lerp(16, 0, join), s: lerp(1, 1.05, join), label: copy.clipA || "Clip A", labelSize: 34, z: 4 });
        card("cardB", "doorB", t - T.how, { x: cx - w / 2, y: yb, w, h }, { persp: 1800, rx: lerp(-16, 0, join), s: lerp(1, 1.05, join), label: copy.clipB || "Clip B", labelSize: 34, z: 3 });
        text("capA", copy.whereStarts || "WHERE IT STARTS", { x: 0, w: W, y: ya - 70, size: 30, font: "mono", weight: 600, ls: 0.28, color: "rgba(244,243,236,0.75)", opacity: fly * (1 - join), z: 5 });
        text("capB", copy.whereGoes || "WHERE IT GOES", { x: 0, w: W, y: yb + h + 34, size: 30, font: "mono", weight: 600, ls: 0.28, color: "rgba(244,243,236,0.75)", opacity: fly * (1 - join), z: 5 });
      } else {
        const w = 700, h = w * 9 / 16;
        const xa = lerp(lerp(-900, cx - 400 - w / 2, fly), cx - w / 2, join), xb = lerp(lerp(W + 900, cx + 400 - w / 2, fly), cx - w / 2, join);
        const y = cy - h / 2 - 20;
        card("cardA", "doorA", t - T.how, { x: xa, y, w, h }, { persp: 1600, ry: lerp(22, 0, join), s: lerp(1, 1.25, join), label: copy.clipA || "Clip A", labelSize: 28, z: 4 });
        card("cardB", "doorB", t - T.how, { x: xb, y, w, h }, { persp: 1600, ry: lerp(-22, 0, join), s: lerp(1, 1.25, join), label: copy.clipB || "Clip B", labelSize: 28, z: 3 });
        text("capA", copy.whereStarts || "WHERE IT STARTS", { x: xa, w, y: y - 64, size: 26, font: "mono", weight: 600, ls: 0.28, color: "rgba(244,243,236,0.75)", opacity: fly * (1 - join), z: 5 });
        text("capB", copy.whereGoes || "WHERE IT GOES", { x: xb, w, y: y - 64, size: 26, font: "mono", weight: 600, ls: 0.28, color: "rgba(244,243,236,0.75)", opacity: fly * (1 - join), z: 5 });
        text("plus", "+", { x: 0, w: W, cy: y + h / 2, size: 120, weight: 300, color: LIME, opacity: fly * (1 - join * 2), z: 5 });
      }
    } else {
      const k = prog(t, T.result, T.car);
      const w = V ? 1000 : 1280, h = w * 9 / 16;
      const y = V ? 470 : cy - h / 2 - 50;
      card("merged", "doorAfter", span(t, T.result, T.car, 1.6, 6.4), { x: cx - w / 2, y, w, h }, { persp: 2000, s: lerp(1.08, 1.0, E.outCubic(prog(t, T.result, T.result + 0.35))) + 0.02 * k,
        label: copy.bridge || "AI bridge", labelSize: V ? 36 : 32, bright: 1 + flash * 0.8, boxShadow: `0 40px 110px rgba(0,0,0,0.6), 0 0 0 2px ${LIME}55, 0 0 60px ${LIME}22`, z: 4 });
    }
    // exit whip into the carousel
  }

  // ---------- 4. CAROUSEL: labelled cards, whip-blur between them ----------
  const items = [
    { clip: "cup", from: 0.9, to: 3.0, label: copy.l1 || "Cup Portal" },
    { clip: "vinyl", from: 0.8, to: 3.0, label: copy.l2 || "Object Match" },
    { clip: "sofa", from: 0.8, to: 3.1, label: copy.l3 || "Environment Morph" },
    { clip: "car", from: 1.0, to: 3.2, label: copy.l4 || "Car Window Portal" },
  ];
  const slot = 2 * B;
  if (t >= T.car - 0.1 && t < T.parade + 0.1) {
    const w = V ? 1000 : 1180, h = w * 9 / 16;
    const baseY = V ? 470 : cy - h / 2 - 70;
    for (let i = -1; i < items.length; i++) {
      // i = -1 is the merged result card leaving on the first whip.
      const a = T.car + i * slot, b = a + slot;
      const inK = i < 0 ? 1 : E.outCubic(prog(t, a - 0.09, a + 0.11));
      const outK = E.inCubic(prog(t, b - 0.09, b + 0.11));
      if (t < a - 0.1 || t > b + 0.12) continue;
      const x = cx - w / 2 + lerp(W * 0.9, 0, inK) + lerp(0, -W * 0.9, outK);
      const vel = Math.max(1 - Math.abs(inK - 0.5) * 2, 0) * (inK < 1 ? 1 : 0) + Math.max(1 - Math.abs(outK - 0.5) * 2, 0) * (outK > 0 ? 1 : 0);
      if (i < 0) {
        const mw = V ? 1000 : 1280, mh = mw * 9 / 16, my = V ? 470 : cy - mh / 2 - 50;
        card("merged", "doorAfter", 6.4, { x: cx - mw / 2 + lerp(0, -W * 0.9, outK), y: my, w: mw, h: mh }, { persp: 2000, hblur: vel * 70, label: copy.bridge || "AI bridge", labelSize: V ? 36 : 32, z: 4 });
        continue;
      }
      const it = items[i];
      card(`car${i}`, it.clip, span(t, a, b, it.from, it.to), { x, y: baseY, w, h }, { persp: 2200, ry: V ? -5 : -9, rx: V ? 6 : 5, hblur: vel * 70, label: it.label, labelSize: V ? 36 : 32, z: 4 });
    }
  }

  // Persistent CTA (like "START CREATING AT HIGGSFIELD.AI"), from the merged result to the parade.
  if (t >= T.result && t < T.parade) {
    const pop = E.outBack(prog(t, T.result, T.result + 0.32));
    const beatPulse = 1 + 0.025 * (1 - E.outCubic(prog(((t - T.result) % (4 * B)), 0, 0.2)));
    const ctaY = V ? 1330 : H - 150;
    text("cta1", copy.cta1 || "TRY 3 FREE ON", { x: 0, w: W, cy: ctaY - (V ? 62 : 48), size: V ? 50 : 40, weight: 800, ls: -0.02, s: pop * beatPulse, opacity: clamp(pop),
      shadow: "0 6px 30px rgba(0,0,0,0.7)", z: 20 });
    text("cta2", copy.cta2 || "CLIPMELT", { x: 0, w: W, cy: ctaY + (V ? 26 : 22), size: V ? 118 : 92, weight: 900, color: LIME, ls: -0.035, s: pop * beatPulse, opacity: clamp(pop),
      shadow: "0 8px 40px rgba(0,0,0,0.75)", z: 20 });
  }

  // ---------- 5. PARADE of real style names over light streaks, then the real library as the hub ----------
  if (t >= T.parade && t < T.end + 0.2) {
    streaks("streaks", (t - T.parade) * 0.9, { opacity: t < T.hub ? 1 : 1 - prog(t, T.end - 0.2, T.end + 0.1), z: 1 });
    if (t < T.hub) {
      const names = copy.parade || ["Whip Pan", "Dolly Through", "Orbit Transition", "Silhouette Match"];
      const step = (T.hub - T.parade) / names.length;
      const i = Math.min(names.length - 1, Math.floor((t - T.parade) / step));
      const lk = prog(t, T.parade + i * step, T.parade + (i + 1) * step);
      const enter = E.outExpo(clamp(lk / 0.35)), leave = E.inCubic(clamp((lk - 0.72) / 0.28));
      text(`parade`, `${names[i]} <em>•</em>`, { x: 0, w: W, cy: cy + lerp(46, 0, enter) + lerp(0, -46, leave), size: V ? 118 : 150, fitW: W - 120, weight: 800, ls: -0.03,
        vblur: (1 - enter) * 14 + leave * 14, opacity: clamp(enter * 1.5) * (1 - leave), z: 6 });
    } else {
      const k = E.outCubic(prog(t, T.hub, T.end));
      const w = V ? 1400 : 1560, h = w * 1800 / 2880;
      media("hub", "img:library", 0, { x: cx - w / 2, y: (V ? cy - 260 : cy) - h / 2, w, h }, { persp: 2400, rx: 16, ry: V ? -8 : -9, rz: 1.5, s: lerp(1.25, V ? 0.78 : 0.9, k), origin: "50% 50%",
        radius: 22, boxShadow: `0 50px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)`, bright: 0.92, opacity: 1 - prog(t, T.end - 0.12, T.end + 0.12), z: 3 });
      const nk = E.outExpo(prog(t, T.hub + 0.05, T.hub + 0.4));
      box("hubScrim", { x: 0, y: 0, w: W, h: H }, { bg: `radial-gradient(${V ? "80% 40% at 50% 74%" : "55% 45% at 50% 52%"}, rgba(6,6,6,0.82) 0%, rgba(6,6,6,0.55) 45%, transparent 75%)`, opacity: nk * (1 - prog(t, T.end - 0.1, T.end + 0.1)), z: 7 });
      text("hubN", copy.hub1 || "49", { x: 0, w: W, cy: V ? cy + 470 : cy - 40, size: V ? 320 : 300, weight: 900, color: LIME, ls: -0.05, s: lerp(1.3, 1, nk), opacity: clamp(nk * 1.4) * (1 - prog(t, T.end - 0.1, T.end + 0.1)),
        shadow: "0 10px 60px rgba(0,0,0,0.8)", z: 8 });
      text("hubT", copy.hub2 || "TRANSITION STYLES", { x: 0, w: W, cy: V ? cy + 660 : cy + 130, size: V ? 64 : 62, weight: 800, ls: -0.02, opacity: clamp(nk * 1.4) * (1 - prog(t, T.end - 0.1, T.end + 0.1)),
        shadow: "0 6px 40px rgba(0,0,0,0.85)", z: 8 });
    }
  }

  // ---------- 6. END CARD: glowing mark, wordmark, tagline, CTA pill ----------
  if (t >= T.end) {
    const k = (d) => E.outBack(prog(t, T.end + d, T.end + d + 0.36));
    const drift = 1 + 0.03 * prog(t, T.end, R.S.duration);
    streaks("streaks", (t - T.parade) * 0.6, { opacity: 0.35, z: 1 });
    box("endGlow", { x: cx - 600, y: (V ? cy - 270 : cy - 290) - 600, w: 1200, h: 1200 }, { bg: `radial-gradient(circle, ${LIME}33 0%, ${LIME}10 38%, transparent 66%)`, radius: 600, opacity: prog(t, T.end, T.end + 0.4), z: 2 });
    const m = V ? 330 : 250;
    media("mark", "img:mark", 0, { x: cx - m / 2, y: (V ? cy - 270 : cy - 290) - m / 2, w: m, h: m }, { fit: "contain", s: k(0) * drift, opacity: clamp(k(0)),
      dropShadow: `drop-shadow(0 0 28px ${LIME}88)`, z: 5 });
    text("word", copy.brand || "Clipmelt", { x: 0, w: W, cy: V ? cy + 20 : cy - 60, size: V ? 176 : 150, weight: 800, ls: -0.045, s: k(0.08) * drift, opacity: clamp(k(0.08)), z: 6 });
    text("tag", copy.tagline || "Two clips. One impossible shot.", { x: 0, w: W, cy: V ? cy + 170 : cy + 70, size: V ? 56 : 50, weight: 600, ls: -0.02, color: "rgba(244,243,236,0.8)",
      s: k(0.18) * drift, opacity: clamp(k(0.18)), z: 6 });
    box("pill", { x: cx - (V ? 290 : 240), y: (V ? cy + 310 : cy + 170), w: V ? 580 : 480, h: V ? 124 : 104 }, { bg: LIME, radius: 70, color: "#10140a",
      font: `800 ${V ? 50 : 42}px ${R.FONT}`, ls: -0.02, html: copy.pill || "Try it free &nbsp;→", s: k(0.3) * drift, opacity: clamp(k(0.3)),
      boxShadow: `0 20px 60px ${LIME}40`, z: 7 });
    if (copy.url) text("url", copy.url, { x: 0, w: W, cy: V ? cy + 530 : cy + 330, size: V ? 34 : 30, font: "mono", weight: 600, ls: 0.12, color: "rgba(244,243,236,0.6)", opacity: prog(t, T.end + 0.45, T.end + 0.7), z: 6 });
  }
};
