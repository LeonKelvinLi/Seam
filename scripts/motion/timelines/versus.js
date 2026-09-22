/*
 * Clipmelt "versus" (vertical), reverse-engineered from Higgsfield's "AI vs VFX" Short:
 *   two stacked 16:9 panels play the same two clips in sync, labelled; top = plain crossfade, bottom = Clipmelt AI bridge.
 * Each pair lasts 8 beats with the transition centred; pairs change with a whip. Then an end card.
 */
window.timeline = function (t, R) {
  const { W, H, E, prog, lerp, clamp, media, text, box, LIME, copy } = R;
  const B = R.beat;
  const pairs = R.S.pairs;
  const PAIR = 8 * B;
  const END = pairs.length * PAIR;
  const cx = W / 2, cy = H / 2;
  box("bg", { x: 0, y: 0, w: W, h: H }, { bg: `radial-gradient(120% 90% at 50% 45%, #14160f 0%, #0b0b0a 55%, #060606 100%)`, z: 0 });

  if (t < END + 0.15) {
    const pw = W, ph = Math.round(pw * 9 / 16);
    const topY = 330, botY = topY + ph + 120;
    const i = Math.min(pairs.length - 1, Math.floor(t / PAIR));
    const lt = t - i * PAIR;
    const p = pairs[i];
    const rate = p.rate || 1.35;
    // Whip between pairs: the outgoing pair slides left with motion blur, the incoming slides in from the right.
    const inK = i === 0 ? 1 : E.outCubic(prog(lt, 0, 0.16));
    const outK = i === pairs.length - 1 ? E.inCubic(prog(lt, PAIR - 0.12, PAIR + 0.04)) * 0 : E.inCubic(prog(lt, PAIR - 0.14, PAIR));
    const dx = lerp(W * 0.9, 0, inK) + lerp(0, -W * 0.9, outK);
    const vel = (inK < 1 ? 1 - Math.abs(inK - 0.5) * 2 : 0) + (outK > 0 ? 1 - Math.abs(outK - 0.5) * 2 : 0);
    const xfSrc = p.xfMid + (lt - PAIR / 2) * rate;
    const aiSrc = p.aiMid + (lt - PAIR / 2) * rate;
    media("top", p.xf, xfSrc, { x: dx, y: topY, w: pw, h: ph }, { hblur: vel * 60, z: 2 });
    media("bot", p.ai, aiSrc, { x: dx, y: botY, w: pw, h: ph }, { hblur: vel * 60, boxShadow: `0 0 0 3px ${LIME}66, 0 0 60px ${LIME}22`, z: 2 });
    // Labels, like "AI" / "VFX" above each panel.
    text("labTop", copy.labelTop || "CROSSFADE", { x: 0, w: W, cy: topY - 48, size: 60, weight: 900, ls: -0.02, color: "rgba(244,243,236,0.92)", z: 5 });
    text("labBot", copy.labelBot || "CLIPMELT", { x: 0, w: W, cy: botY - 52, size: 60, weight: 900, ls: -0.02, color: LIME, z: 5 });
    // Context line at the top for cold viewers, and the pair name.
    text("head", copy.head || "SAME TWO CLIPS.", { x: 0, w: W, cy: 120, size: 84, weight: 900, ls: -0.04, z: 5 });
    text("pairName", p.name, { x: 0, w: W, cy: 205, size: 30, font: "mono", weight: 600, ls: 0.26, color: "rgba(244,243,236,0.65)", opacity: clamp(prog(lt, 0.05, 0.25)) * (1 - outK), z: 5 });
    text("foot", copy.foot || "WHICH ONE WOULD YOU POST?", { x: 0, w: W, cy: botY + ph + 95, size: 44, weight: 800, ls: -0.01, color: "rgba(244,243,236,0.9)", z: 5 });
  }

  if (t >= END - 0.05) {
    const k = (d) => E.outBack(prog(t, END + d, END + d + 0.34));
    box("endGlow", { x: cx - 560, y: cy - 330 - 560, w: 1120, h: 1120 }, { bg: `radial-gradient(circle, ${LIME}33 0%, ${LIME}10 38%, transparent 66%)`, radius: 560, opacity: clamp(k(0)), z: 6 });
    box("endBg", { x: 0, y: 0, w: W, h: H }, { bg: "rgba(8,8,7,0.94)", opacity: clamp(prog(t, END - 0.05, END + 0.12)), z: 5 });
    text("stop", copy.stop || "Stop <em>crossfading.</em>", { x: 0, w: W, cy: cy - 470, size: 104, fitW: W - 90, weight: 900, ls: -0.045, s: k(0), opacity: clamp(k(0)), z: 8 });
    media("mark", "img:mark", 0, { x: cx - 140, y: cy - 200 - 140, w: 280, h: 280 }, { fit: "contain", s: k(0.1), opacity: clamp(k(0.1)), dropShadow: `drop-shadow(0 0 28px ${LIME}88)`, z: 8 });
    text("word", copy.brand || "Clipmelt", { x: 0, w: W, cy: cy + 60, size: 170, weight: 800, ls: -0.045, s: k(0.16), opacity: clamp(k(0.16)), z: 8 });
    text("tag", copy.tagline || "Two clips. One impossible shot.", { x: 0, w: W, cy: cy + 200, size: 54, weight: 600, ls: -0.02, color: "rgba(244,243,236,0.8)", s: k(0.22), opacity: clamp(k(0.22)), z: 8 });
    box("pill", { x: cx - 290, y: cy + 320, w: 580, h: 124 }, { bg: LIME, radius: 70, color: "#10140a", font: `800 50px ${R.FONT}`, ls: -0.02, html: copy.pill || "Try 3 free &nbsp;→",
      s: k(0.3), opacity: clamp(k(0.3)), boxShadow: `0 20px 60px ${LIME}40`, z: 8 });
  }
};
