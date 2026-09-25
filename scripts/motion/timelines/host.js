/*
 * Clipmelt UGC with a presenter ("Only 2 seconds of this are AI", docs/growth/2026-09-24-ugc-heygen-blueprint.md).
 * One HeyGen take is cut into voice segments (S.vo: [{from, to, at}] in take seconds / timeline seconds); whenever the
 * host is on screen his frames come from the same take time as the voice, so lip-sync survives the cuts.
 * Sections (S.marks, seconds): hook → pain (keyframe flash, then host full screen) → reveal (rewind, slow motion with
 * a REAL | AI | REAL bar, host PiP) → app (real screen recording, host PiP, real elapsed clock) → more results →
 * cta (host full screen) → end card that dissolves into the first frame so the ad loops.
 */
(function () {
  const R = window.R, S = R.S;
  const { W, H, E, prog, lerp, clamp, LIME } = R;
  const M = S.marks;
  const [aiFrom, aiTo] = S.ai;

  const capHtml = (s) => `<span style="background:#fff;color:#0d0d0c;padding:0.12em 0.42em 0.17em;border-radius:0.26em;` +
    `-webkit-box-decoration-break:clone;box-decoration-break:clone">${s}</span>`;
  function cap(id, s, t, t0, t1, cy = 470, fade = 0.1) {
    if (t < t0 || t >= t1) return;
    const p = E.outCubic(prog(t, t0, t0 + fade));
    R.text(id, capHtml(s), { x: 80, w: W - 160, cy, size: 60, weight: 800, lh: 1.45, ls: -0.015, wrap: true, s: 0.92 + 0.08 * p, opacity: clamp(p * 2), z: 60 });
  }
  const chip = (id, html, lime, op = 1, y = 300) => R.box(id, { x: 65, y, w: Math.max(220, html.length * 16.5 + 60), h: 60 }, {
    bg: lime ? LIME : "rgba(12,12,11,0.62)", radius: 12, color: lime ? "#10140a" : "#f4f3ec", font: `700 26px ${R.MONO}`, ls: 0.04, html, opacity: op, z: 55 });
  function corners(op) {
    const m = 38, L = 112, th = 9;
    const c = (id, x, y, sides) => R.box(id, { x, y, w: L, h: L }, { css: Object.fromEntries(sides.map((sd) => [`border${sd}`, `${th}px solid ${LIME}`])), opacity: op, z: 54 });
    c("vfTL", m, m, ["Top", "Left"]); c("vfTR", W - m - L, m, ["Top", "Right"]);
    c("vfBL", m, H - m - L, ["Bottom", "Left"]); c("vfBR", W - m - L, H - m - L, ["Bottom", "Right"]);
  }
  const aiTag = (x, y, op = 1) => R.box("aiTag", { x, y, w: 150, h: 36 }, { bg: "rgba(12,12,11,0.72)", border: `1.5px solid ${LIME}`, radius: 18,
    color: "#f4f3ec", font: `600 20px ${R.MONO}`, ls: 0.04, html: "AI avatar", opacity: op, z: 58 });
  const revealWarp = R.monotone(S.revealWarp);
  const appWarp = R.monotone(S.app.warp);
  const hostAt = (t) => { for (const v of S.vo) if (t >= v.at && t < v.at + (v.to - v.from)) return v.from + (t - v.at); return null; };

  /** The presenter: full screen, or a small picture-in-picture card (bottom-left, inside the safe zone). */
  function host(t, mode, k = 1) {
    const ht = hostAt(t);
    const at = ht ?? S.hostIdle;
    if (mode === "full") {
      R.media("host", "host", at, { x: 0, y: 0, w: W, h: H }, { z: 20, objPos: "50% 30%" });
      aiTag(65, 300, 1);
    } else {
      const w = 300, h = 400, x = 65, y = 840;
      R.media("host", "host", at, { x, y: y + (1 - k) * 40, w, h }, { z: 50, radius: 24, objPos: "50% 22%", imgScale: 1.25, opacity: k,
        border: "2px solid rgba(244,243,236,0.35)", boxShadow: "0 18px 40px rgba(0,0,0,0.5)" });
      aiTag(x + 12, y - 18 + (1 - k) * 40, k);
    }
  }

  /** A generic keyframe timeline (no real software UI): rows of diamonds and bezier mask paths filling up fast. */
  function graveyard(u) {
    R.box("gyBg", { x: 0, y: 0, w: W, h: H }, { bg: "#16171a", z: 10 });
    const rows = 14, cols = 34, fill = clamp(u / 0.7);
    let html = "";
    for (let r = 0; r < rows; r++) {
      html += `<div style="position:absolute;left:0;right:0;top:${r * 64}px;height:56px;background:${r % 2 ? "#1d1f23" : "#191b1f"}">`;
      for (let c = 0; c < cols; c++) {
        if ((c * 7 + r * 13) % 5 === 0 || c / cols > fill) continue;
        const x = 20 + c * 30 + ((r * 11) % 9);
        html += `<i style="position:absolute;left:${x}px;top:17px;width:14px;height:14px;transform:rotate(45deg);background:${r % 3 ? "#f2c14e" : "#6fa8ff"}"></i>`;
      }
      html += "</div>";
    }
    R.text("gyRows", `<div style="position:relative;height:${rows * 64}px">${html}</div>`, { x: 0, w: W, y: 520, size: 10, z: 11 });
    cap("gyCap", "keyframes · masks · motion tracking", u, 0, 99, 400, 0.05);
  }

  window.timeline = function (t) {
    const c = R.copy;
    if (t >= M.end) {
      // End card, then dissolve back into the first frame so a replay reads as one loop.
      const u = t - M.end, back = prog(u, S.endHold, S.endHold + 0.5);
      R.outro(u, { brand: c.brand, url: c.url, line: c.outroLine });
      if (back > 0) R.media("loop", "full", S.hookFrom, { x: 0, y: 0, w: W, h: H }, { z: 95, opacity: back });
      return;
    }
    if (t < M.pain) {
      // 1. Hook: real footage already moving, the AI stretch lands inside the first 3 s, then a freeze.
      const src = Math.min(S.hookFrom + t, S.hookTo);
      const frozen = S.hookFrom + t > S.hookTo;
      R.media("main", "full", src, { x: 0, y: 0, w: W, h: H }, { z: 1, imgScale: frozen ? lerp(1.0, 1.08, E.outCubic(prog(t, S.hookTo - S.hookFrom, M.pain))) : 1.03 });
      cap("h1", S.hook[0], t, 0, S.hookTo - S.hookFrom, 440, 0.01);
      cap("h2", S.hook[1], t, 1.1, S.hookTo - S.hookFrom, 600);
      if (frozen) cap("h3", S.hook[2], t, S.hookTo - S.hookFrom, M.pain, 470);
    } else if (t < M.reveal) {
      // 2. Pain: a keyframe flash under the first words, then the host full screen.
      const u = t - M.pain;
      if (u < S.flash) graveyard(u);
      else host(t, "full");
      (S.painCaps || []).forEach((k, j) => cap(`pc${j}`, k.text, t, k.from, k.to, k.cy ?? 470));
    } else if (t < M.app) {
      // 3. Reveal: rewind, then slow motion over the join; the AI chip lights on "this part".
      const [s0, s1] = S.slow;
      const slowing = t >= M.reveal + S.rewind;
      // S.revealWarp maps timeline seconds to source seconds, so the AI stretch can start exactly on a spoken word.
      const src = slowing ? Math.min(s1, revealWarp(t)) : lerp(S.hookTo, s0, E.inOutCubic(prog(t, M.reveal, M.reveal + S.rewind)));
      R.media("main", slowing ? "slow" : "full", slowing ? src - s0 : src, { x: 0, y: 0, w: W, h: H }, { z: 1, vblur: slowing ? 0 : 10 });
      const ai = src >= aiFrom && src < aiTo, op = slowing ? E.outCubic(prog(t, M.reveal + S.rewind, M.reveal + S.rewind + 0.25)) : 0;
      if (slowing) {
        chip(ai ? "chipAi" : "chipReal", ai ? `AI · ${S.aiLabel}` : src < aiFrom ? "REAL CLIP 1" : "REAL CLIP 2", ai, op);
        if (ai) corners(op);
        const bx = 80, bw = W - 160, by = 760, span = s1 - s0, xs = (v) => bx + ((v - s0) / span) * bw;
        R.box("barA", { x: bx, y: by, w: xs(aiFrom) - bx, h: 14 }, { bg: "rgba(244,243,236,0.6)", radius: 7, opacity: op, z: 55 });
        R.box("barAi", { x: xs(aiFrom), y: by, w: xs(aiTo) - xs(aiFrom), h: 14 }, { bg: LIME, radius: 7, opacity: op, z: 55 });
        R.box("barB", { x: xs(aiTo), y: by, w: bx + bw - xs(aiTo), h: 14 }, { bg: "rgba(244,243,236,0.6)", radius: 7, opacity: op, z: 55 });
        R.box("barHead", { x: xs(src) - 5, y: by - 14, w: 10, h: 42 }, { bg: "#fff", radius: 5, boxShadow: "0 0 18px rgba(0,0,0,0.6)", opacity: op, z: 56 });
      } else R.box("rw", { x: 65, y: 300, w: 230, h: 60 }, { bg: "rgba(12,12,11,0.7)", radius: 12, color: "#fff", font: `800 28px ${R.MONO}`, html: "◀◀ REWIND", z: 55 });
      host(t, "pip", E.outCubic(prog(t, M.reveal, M.reveal + 0.3)));
      (S.revealCaps || []).forEach((k, j) => cap(`rc${j}`, k.text, t, k.from, k.to, k.cy ?? 470));
    } else if (t < M.more) {
      // 4. The real app, recorded on a phone, sped up; the clock shows the real elapsed time.
      const a = S.app, rt = appWarp(t);
      R.box("appBg", { x: 0, y: 0, w: W, h: H }, { bg: "#0b0b0a", z: 1 });
      const pw = 780, px = (W - pw) / 2;
      R.media("app", "app", rt, { x: px, y: 150, w: pw, h: pw * (a.h / a.w) }, { z: 2, radius: 46, border: "10px solid #26272a", boxShadow: "0 40px 90px rgba(0,0,0,0.6)" });
      // The waits are compressed; say so rather than show a clock.
      R.box("sped", { x: W - 65 - 200, y: 300, w: 200, h: 60 }, { bg: "rgba(12,12,11,0.78)", radius: 12, color: "#f4f3ec", font: `700 26px ${R.MONO}`,
        html: "⏩ sped up", opacity: rt > a.fastFrom && rt < a.fastTo ? 1 : 0.0, z: 55 });
      host(t, "pip");
      (S.appCaps || []).forEach((k, j) => cap(`ac${j}`, k.text, t, k.from, k.to, k.cy ?? 470));
    } else if (t < M.cta) {
      // 5. Two more real results, back to back.
      const list = S.more, per = (M.cta - M.more) / list.length, i = Math.min(list.length - 1, Math.floor((t - M.more) / per)), r = list[i];
      const src = r.from + (t - M.more - i * per) * r.speed;
      R.media("more", r.clip, src, { x: 0, y: 0, w: W, h: H }, { z: 1 });
      const ai = src >= r.ai[0] && src < r.ai[1];
      chip(ai ? "chipAi" : "chipReal", ai ? "AI TRANSITION" : "REAL CLIP", ai, 1);
      if (ai) corners(1);
      cap("moreCap", S.moreCap, t, M.more, M.cta, 470);
    } else {
      // 6. CTA: the host full screen, one idea.
      host(t, "full");
      (S.ctaCaps || []).forEach((k, j) => cap(`cc${j}`, k.text, t, k.from, k.to, k.cy ?? 470));
    }
    if (c.url && t >= M.cta - 0.01) {
      const w = c.url.length * 18.2 + 110;
      R.box("urlPill", { x: (W - w) / 2, y: 1150, w, h: 78 }, { bg: LIME, radius: 39, color: "#10140a", font: `800 31px ${R.MONO}`, ls: 0,
        html: c.url, opacity: E.outCubic(prog(t, M.cta + 1.2, M.cta + 1.5)), z: 58 });
    }
  };
})();
