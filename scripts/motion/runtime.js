/*
 * In-page compositor runtime for Clipmelt motion ads (loaded by page.html, driven by scripts/motion/render.mjs).
 * Immediate mode: every frame the timeline declares the layers it wants; layers not declared are hidden.
 * Clip layers show pre-extracted JPEG frames, so every frame is deterministic and seek-free.
 */
(function () {
  const S = window.SPEC;
  const W = S.width, H = S.height, FPS = S.fps;
  const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';
  const FG = "#f4f3ec", LIME = S.accent || "#d9fc69", BG = S.bg || "#0b0b0a";
  const stage = document.getElementById("stage");
  Object.assign(stage.style, { position: "relative", width: W + "px", height: H + "px", overflow: "hidden", background: BG });
  const defs = document.getElementById("fx-defs");
  const layers = new Map();
  let used = new Set();
  let pending = [];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
  const E = {
    linear: (x) => x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inCubic: (x) => x * x * x,
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
    outBack: (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outQuint: (x) => 1 - Math.pow(1 - x, 5),
  };

  /** Source frame URL for a clip at a given source time (seconds). */
  function frameUrl(name, sec) {
    const c = S.clipFrames[name];
    if (!c) throw new Error(`unknown clip ${name}`);
    const idx = clamp(Math.round(sec * c.fps) + 1, 1, c.count);
    return `${c.dir}/${String(idx).padStart(5, "0")}.jpg`;
  }
  /** Source time for a clip window [from, to] played across [a, b] of the timeline. */
  function span(t, a, b, from, to, ease = E.linear) { return lerp(from, to, ease(prog(t, a, b))); }

  function layer(id, parentId) {
    let L = layers.get(id);
    if (!L) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.dataset.id = id;
      (parentId ? layers.get(parentId).el : stage).appendChild(el);
      L = { el };
      layers.set(id, L);
    }
    used.add(id);
    L.el.style.display = "block";
    return L;
  }

  function hblurId(key, x, y) {
    const id = `hb-${key}`;
    let f = document.getElementById(id);
    if (!f) {
      f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      f.setAttribute("id", id); f.setAttribute("x", "-40%"); f.setAttribute("y", "-40%"); f.setAttribute("width", "180%"); f.setAttribute("height", "180%");
      f.setAttribute("color-interpolation-filters", "sRGB");
      const g = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      g.setAttribute("edgeMode", "none");
      f.appendChild(g); defs.appendChild(f);
    }
    f.firstChild.setAttribute("stdDeviation", `${x.toFixed(2)} ${y.toFixed(2)}`);
    return id;
  }

  function tf(o) {
    const p = [];
    if (o.persp) p.push(`perspective(${o.persp}px)`);
    if (o.tx || o.ty || o.tz) p.push(`translate3d(${o.tx || 0}px, ${o.ty || 0}px, ${o.tz || 0}px)`);
    if (o.rx) p.push(`rotateX(${o.rx}deg)`);
    if (o.ry) p.push(`rotateY(${o.ry}deg)`);
    if (o.rz) p.push(`rotate(${o.rz}deg)`);
    if (o.s != null && o.s !== 1) p.push(`scale(${o.s})`);
    return p.length ? p.join(" ") : "none";
  }
  function filt(o, key) {
    const f = [];
    if ((o.hblur || 0) > 0.3 || (o.vblur || 0) > 0.3) f.push(`url(#${hblurId(key, o.hblur || 0, o.vblur || 0)})`);
    if ((o.blur || 0) > 0.2) f.push(`blur(${o.blur}px)`);
    if (o.bright != null && Math.abs(o.bright - 1) > 0.005) f.push(`brightness(${o.bright})`);
    if (o.sat != null && Math.abs(o.sat - 1) > 0.005) f.push(`saturate(${o.sat})`);
    if (o.contrast != null && Math.abs(o.contrast - 1) > 0.005) f.push(`contrast(${o.contrast})`);
    if (o.dropShadow) f.push(o.dropShadow);
    return f.length ? f.join(" ") : "none";
  }
  function common(L, id, o, z) {
    const el = L.el;
    el.style.transform = tf(o);
    el.style.transformOrigin = o.origin || "50% 50%";
    el.style.opacity = String(o.opacity ?? 1);
    el.style.filter = filt(o, id);
    el.style.zIndex = String(o.z ?? z);
    el.style.mixBlendMode = o.blend || "normal";
  }
  const px = (v) => `${v}px`;

  /** A clip (or still image) filling a box with cover fit. box = {x, y, w, h} (top-left). name "img:key" shows a still. */
  function media(id, name, sec, box, o = {}) {
    const L = layer(id, o.parent);
    const el = L.el;
    if (!L.img) {
      L.img = document.createElement("img");
      Object.assign(L.img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block", transformOrigin: "50% 50%" });
      el.appendChild(L.img);
      el.style.overflow = "hidden";
    }
    const src = name.startsWith("img:") ? S.images[name.slice(4)] : frameUrl(name, sec);
    if (L.src !== src) { L.src = src; L.img.src = src; pending.push(L.img); }
    Object.assign(el.style, { left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h), borderRadius: px(o.radius || 0),
      boxShadow: o.boxShadow || "none", border: o.border || "none", background: o.bg || "transparent" });
    L.img.style.objectPosition = o.objPos || "50% 50%";
    L.img.style.transform = o.imgScale && o.imgScale !== 1 ? `scale(${o.imgScale})` : "none";
    L.img.style.objectFit = o.fit || "cover";
    common(L, id, o, 1);
    return L;
  }

  /** A 3D card: rounded media with an optional pill label (bottom-centre) and optional caption above. */
  function card(id, name, sec, box, o = {}) {
    const L = media(id, name, sec, box, { radius: o.radius ?? Math.round(box.w * 0.022), boxShadow: o.boxShadow ?? "0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)", ...o });
    if (o.label != null) {
      const p = layer(`${id}-pill`, id);
      const size = o.labelSize || Math.round(box.w * 0.028);
      if (p.text !== o.label) { p.el.textContent = o.label; p.text = o.label; }
      Object.assign(p.el.style, { left: "50%", bottom: px(Math.round(box.h * 0.055)), transform: "translateX(-50%)", padding: `${Math.round(size * 0.42)}px ${Math.round(size * 0.95)}px`,
        borderRadius: "999px", background: o.labelBg || "rgba(12,12,11,0.78)", color: o.labelColor || FG, font: `600 ${size}px ${FONT}`, letterSpacing: "-0.01em",
        border: "1px solid rgba(255,255,255,0.16)", whiteSpace: "nowrap", zIndex: "3", backdropFilter: "blur(6px)", opacity: String(o.labelOpacity ?? 1) });
    }
    return L;
  }

  /** Text block. Position with {x, w} + {y} (top) or {cy} (vertical centre). html may contain <em> for the accent colour. */
  function text(id, html, o) {
    const L = layer(id, o.parent);
    const el = L.el;
    if (L.html !== html) { el.innerHTML = html; L.html = html; }
    Object.assign(el.style, { left: px(o.x ?? 0), width: px(o.w ?? W), textAlign: o.align || "center", fontFamily: o.font === "mono" ? MONO : (o.font || FONT),
      fontWeight: String(o.weight || 800), fontSize: px(o.size), lineHeight: String(o.lh ?? 0.92), letterSpacing: `${o.ls ?? -0.045}em`, color: o.color || FG,
      whiteSpace: o.wrap ? "normal" : "nowrap", textShadow: o.shadow || "none", textTransform: o.upper ? "uppercase" : "none", fontStretch: o.stretch || "normal" });
    el.querySelectorAll("em").forEach((e) => { e.style.fontStyle = "normal"; e.style.color = o.accent || LIME; });
    if (o.fitW) { // shrink to fit a width
      el.style.fontSize = px(o.size);
      const natural = el.scrollWidth;
      const inner = el.firstElementChild ? Math.max(...[...el.children].map((c) => c.scrollWidth)) : natural;
      const wNow = Math.max(inner, measure(el));
      if (wNow > o.fitW) el.style.fontSize = px(Math.floor(o.size * o.fitW / wNow));
    }
    const top = o.cy != null ? o.cy - el.offsetHeight / 2 : (o.y ?? 0);
    el.style.top = px(top);
    common(L, id, o, 5);
    return L;
  }
  function measure(el) {
    const r = document.createRange(); r.selectNodeContents(el);
    return r.getBoundingClientRect().width;
  }

  /** Plain box (backgrounds, glows, flashes, pills). */
  function box(id, b, o = {}) {
    const L = layer(id, o.parent);
    Object.assign(L.el.style, { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h), background: o.bg || "transparent", borderRadius: px(o.radius || 0),
      boxShadow: o.boxShadow || "none", border: o.border || "none", display: "flex", alignItems: "center", justifyContent: "center",
      color: o.color || FG, font: o.font || `700 ${o.size || 32}px ${FONT}`, letterSpacing: o.ls != null ? `${o.ls}em` : "-0.01em" });
    if (o.html != null && L.html !== o.html) { L.el.innerHTML = o.html; L.html = o.html; }
    if (o.css) Object.assign(L.el.style, o.css);
    common(L, id, o, o.z ?? 2);
    return L;
  }

  /** Brand orb: lime glow ball with a dark sparkle, like a product "energy" motif. */
  function orb(id, cx, cy, r, o = {}) {
    const L = box(`${id}-glow`, { x: cx - r * 2.2, y: cy - r * 2.2, w: r * 4.4, h: r * 4.4 }, { bg: `radial-gradient(circle, ${LIME}66 0%, ${LIME}22 35%, transparent 68%)`, radius: r * 2.2, z: o.z ?? 3, opacity: o.opacity ?? 1, blend: "screen" });
    box(`${id}-ball`, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, { bg: `radial-gradient(circle at 38% 34%, #f4ffc9 0%, ${LIME} 42%, #9fcf2b 100%)`, radius: r, z: (o.z ?? 3) + 1,
      opacity: o.opacity ?? 1, boxShadow: `0 0 ${r * 0.9}px ${LIME}aa, 0 0 ${r * 2.2}px ${LIME}55`, html: `<span style="font:700 ${Math.round(r * 0.95)}px ${FONT};color:#10140a;transform:translateY(-4%)">✦</span>` });
    return L;
  }

  /** Neon light streaks background (SVG), phase animates the dashes. */
  function streaks(id, phase, o = {}) {
    const L = layer(id);
    if (!L.svg) {
      const paths = [
        `M -100 ${H * 0.72} C ${W * 0.25} ${H * 0.52}, ${W * 0.55} ${H * 0.95}, ${W + 100} ${H * 0.6}`,
        `M -100 ${H * 0.35} C ${W * 0.3} ${H * 0.62}, ${W * 0.65} ${H * 0.12}, ${W + 100} ${H * 0.42}`,
        `M -100 ${H * 0.88} C ${W * 0.4} ${H * 0.7}, ${W * 0.7} ${H * 1.02}, ${W + 100} ${H * 0.78}`,
        `M -100 ${H * 0.18} C ${W * 0.35} ${H * 0.05}, ${W * 0.6} ${H * 0.36}, ${W + 100} ${H * 0.14}`,
      ];
      L.el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="${id}-g" x1="0" x2="1"><stop offset="0" stop-color="${LIME}" stop-opacity="0"/><stop offset="0.5" stop-color="${LIME}" stop-opacity="0.95"/><stop offset="1" stop-color="#6ff3ff" stop-opacity="0"/></linearGradient>
        <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        ${paths.map((d, i) => `<path class="s" d="${d}" fill="none" stroke="url(#${id}-g)" stroke-width="${i % 2 ? 2.5 : 3.5}" stroke-linecap="round" filter="url(#${id}-glow)" stroke-dasharray="${W * 0.55} ${W * 1.4}"/>`).join("")}
      </svg>`;
      L.svg = L.el.firstChild;
      Object.assign(L.el.style, { left: "0", top: "0", width: px(W), height: px(H) });
    }
    [...L.svg.querySelectorAll("path.s")].forEach((p, i) => p.setAttribute("stroke-dashoffset", String(-(phase * W * (1.1 + i * 0.25)) + i * 300)));
    common(L, id, o, o.z ?? 1);
    return L;
  }

  /** Mouse cursor with a click ripple (clickAt in timeline seconds). */
  function cursor(id, x, y, t, clickAt, o = {}) {
    const L = layer(id);
    if (!L.init) {
      L.el.innerHTML = `<svg width="46" height="46" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.4 21.5 L14 20.4 L11.2 13.8 L17.5 13.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
      L.init = true;
    }
    const pressed = clickAt != null && t >= clickAt && t < clickAt + 0.12;
    Object.assign(L.el.style, { left: px(x), top: px(y), width: "46px", height: "46px" });
    common(L, id, { ...o, s: pressed ? 0.86 : 1, origin: "10% 10%", dropShadow: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }, 40);
    if (clickAt != null) {
      const k = prog(t, clickAt, clickAt + 0.45);
      box(`${id}-ripple`, { x: x - 36, y: y - 36, w: 72, h: 72 }, { radius: 36, border: `3px solid ${LIME}`, opacity: k > 0 && k < 1 ? 1 - k : 0, s: 0.4 + k * 1.4, z: 39 });
    }
    return L;
  }

  /**
   * End sting in the manner of TikTok's outro: black frame, the mark pops in with two coloured split copies (lime and
   * magenta, offset in opposite directions) that jitter and settle, with short glitch ticks; the wordmark follows with
   * the same split, then an offer line. u = seconds since the sting started. Uses S.images.mark.
   */
  function outro(u, o = {}) {
    const cx = W / 2, cy = o.cy ?? H * 0.47, MAG = o.split2 || "#ff2e88";
    box("outBg", { x: 0, y: 0, w: W, h: H }, { bg: "#000", z: 90 });
    const n = (k) => Math.sin(u * 91.7 + k * 12.9) * Math.sin(u * 37.3 + k * 4.1);
    const tick = (o.ticks || [0.5, 0.74, 1.62]).some((a) => u >= a && u < a + 0.07) ? 1 : 0;
    const pop = E.outBack(prog(u, 0.06, 0.4)), settle = 1 - prog(u, 0.06, 0.75);
    const d = 5 + 20 * settle + 12 * tick + 2.5 * n(1);
    const size = o.markSize || 300;
    if (u >= 0.06) {
      media("outMark", "img:mark", 0, { x: cx - size / 2 + (tick ? 18 * n(2) : 1.5 * n(3) * settle), y: cy - 200 - size / 2, w: size, h: size },
        { fit: "contain", s: lerp(0.35, 1, pop), opacity: clamp(pop * 2), z: 92,
          dropShadow: `drop-shadow(${(-d).toFixed(1)}px ${(-d * 0.6).toFixed(1)}px 0 ${LIME}) drop-shadow(${d.toFixed(1)}px ${(d * 0.6).toFixed(1)}px 0 ${MAG})` });
    }
    const w = E.outCubic(prog(u, 0.48, 0.78));
    const dt = 3 + 10 * (1 - prog(u, 0.48, 1.0)) + 8 * tick;
    if (u >= 0.48) {
      text("outWord", o.brand || "Clipmelt", { x: 0, w: W, cy: cy + 50, size: 136, weight: 800, ls: -0.045, opacity: clamp(w * 1.5), s: lerp(0.92, 1, w),
        tx: tick ? -12 * n(4) : 0, shadow: `${(-dt).toFixed(1)}px ${(-dt * 0.6).toFixed(1)}px 0 ${LIME}, ${dt.toFixed(1)}px ${(dt * 0.6).toFixed(1)}px 0 ${MAG}`, z: 92 });
    }
    const l = E.outCubic(prog(u, 0.9, 1.2));
    if (u >= 0.9 && o.line) text("outLine", o.line, { x: 0, w: W, cy: cy + 190, size: 46, weight: 600, ls: -0.01, color: "rgba(244,243,236,0.8)", opacity: l, ty: (1 - l) * 16, z: 92 });
  }

  /** Monotone cubic interpolation (Fritsch-Carlson) through [x, y] keys: smooth speed ramps that never run backwards. */
  function monotone(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], u = (x - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }

  window.R = { S, W, H, FPS, FONT, MONO, FG, LIME, BG, clamp, lerp, prog, span, E, media, card, text, box, orb, streaks, cursor, monotone, outro, copy: S.copy || {}, beat: S.beat || 0.44 };

  window.renderFrame = async (t) => {
    used = new Set();
    pending = [];
    window.timeline(t, window.R);
    for (const [id, L] of layers) if (!used.has(id)) L.el.style.display = "none";
    await Promise.all(pending.map((img) => img.decode().catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  };
})();
