/**
 * Vector stand-ins for the homepage examples. They render instantly with no media, and are
 * replaced by real clips as soon as public/examples/manifest.json exists (see scripts/build-examples.ts).
 */
export interface DemoExample { id: string; title: string; a: string; b: string; move: string }

export const DEMO_EXAMPLES: DemoExample[] = [
  { id: "coffee-ocean", title: "Coffee → Ocean", a: "coffee", b: "ocean", move: "Dive Through the Coffee" },
  { id: "wheel-tunnel", title: "Car Wheel → Tunnel", a: "wheel", b: "tunnel", move: "Tunnel Rush" },
  { id: "eye-space", title: "Eye → Space", a: "eye", b: "space", move: "Through the Eye" },
  { id: "phone-city", title: "Phone → City", a: "phone", b: "city", move: "Phone Screen Portal" },
  { id: "door-beach", title: "Door → Beach", a: "door", b: "beach", move: "Door Portal" },
  { id: "window-clouds", title: "Airplane Window → Clouds", a: "window", b: "clouds", move: "Fly Through the Window" },
  { id: "steam-fog", title: "Food Steam → Mountain Fog", a: "steam", b: "mountain", move: "Through the Steam" },
  { id: "mirror-outfit", title: "Mirror → Different Outfit", a: "mirror", b: "outfit", move: "Mirror Portal" },
];

export function Scene({ kind }: { kind: string }) {
  const S = SCENES[kind] ?? SCENES.coffee;
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`g-${kind}`} cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor={S.c1} /><stop offset="100%" stopColor={S.c2} /></radialGradient>
        <linearGradient id={`l-${kind}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={S.c1} /><stop offset="100%" stopColor={S.c2} /></linearGradient>
      </defs>
      {S.draw(kind)}
    </svg>
  );
}

type SceneDef = { c1: string; c2: string; draw: (k: string) => React.ReactNode };

const SCENES: Record<string, SceneDef> = {
  coffee: { c1: "#6b3f22", c2: "#1b100a", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><ellipse cx="80" cy="50" rx="34" ry="30" fill="#efe6d6" /><ellipse cx="80" cy="50" rx="28" ry="24" fill="#3b2314" /><ellipse cx="80" cy="50" rx="24" ry="20" fill="#5a3418" /><path d="M70 22 q4 -8 0 -14 M80 20 q4 -8 0 -14 M90 22 q4 -8 0 -14" stroke="#ffffff55" strokeWidth="1.5" fill="none" /></>) },
  ocean: { c1: "#2a7fb8", c2: "#06263f", draw: (k) => (<><rect width="160" height="90" fill={`url(#l-${k})`} /><rect y="46" width="160" height="44" fill="#0d4d78" /><path d="M0 60 q20 -6 40 0 t40 0 t40 0 t40 0 v30 H0z" fill="#1a6ea3" /><circle cx="118" cy="26" r="9" fill="#ffe8b0" opacity="0.9" /></>) },
  wheel: { c1: "#3a3a3d", c2: "#0e0e10", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><circle cx="80" cy="46" r="34" fill="#1a1a1c" /><circle cx="80" cy="46" r="24" fill="#6d6d72" /><circle cx="80" cy="46" r="7" fill="#c9c9cc" />{[0, 60, 120, 180, 240, 300].map((a) => <rect key={a} x="78" y="24" width="4" height="22" fill="#2b2b2e" transform={`rotate(${a} 80 46)`} />)}</>) },
  tunnel: { c1: "#f0b35a", c2: "#100904", draw: (k) => (<><rect width="160" height="90" fill="#100904" /><circle cx="80" cy="45" r="44" fill="#4a2a10" /><circle cx="80" cy="45" r="30" fill="#8a4c1a" /><circle cx="80" cy="45" r="16" fill={`url(#g-${k})`} /><circle cx="80" cy="45" r="6" fill="#fff2c0" /></>) },
  eye: { c1: "#7a5a3a", c2: "#1a120c", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><path d="M20 45 q60 -40 120 0 q-60 40 -120 0z" fill="#f3e9dd" /><circle cx="80" cy="45" r="19" fill="#3d6a5a" /><circle cx="80" cy="45" r="9" fill="#050505" /><circle cx="86" cy="39" r="3" fill="#fff" /></>) },
  space: { c1: "#0a0a2a", c2: "#000000", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} />{Array.from({ length: 40 }).map((_, i) => <circle key={i} cx={(i * 37) % 160} cy={(i * 53) % 90} r={(i % 3) * 0.4 + 0.3} fill="#fff" />)}<circle cx="110" cy="30" r="12" fill="#2b6cb0" /><circle cx="106" cy="28" r="4" fill="#7fb8e6" /></>) },
  phone: { c1: "#2c2c30", c2: "#0c0c0e", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><rect x="58" y="6" width="44" height="80" rx="7" fill="#1a1a1c" stroke="#555" /><rect x="62" y="12" width="36" height="68" rx="4" fill="#2f6fed" /><rect x="66" y="18" width="28" height="6" rx="2" fill="#ffffff66" /><rect x="66" y="28" width="20" height="4" rx="2" fill="#ffffff44" /></>) },
  city: { c1: "#3a4a7a", c2: "#0b0f1e", draw: (k) => (<><rect width="160" height="90" fill={`url(#l-${k})`} />{[0, 22, 40, 66, 90, 112, 134].map((x, i) => <rect key={x} x={x} y={30 + (i % 3) * 12} width={18 + (i % 2) * 8} height="60" fill={i % 2 ? "#141a30" : "#1b2340"} />)}{Array.from({ length: 30 }).map((_, i) => <rect key={i} x={4 + (i * 17) % 150} y={40 + (i * 11) % 44} width="2" height="3" fill="#ffd27a" />)}</>) },
  door: { c1: "#4a3b2a", c2: "#15100b", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><rect x="56" y="10" width="48" height="80" fill="#2a1e14" /><rect x="60" y="14" width="40" height="76" fill="#7a5a3a" /><rect x="64" y="20" width="32" height="66" fill="#8ec5e8" /><circle cx="94" cy="54" r="2" fill="#e0c070" /></>) },
  beach: { c1: "#8ec5e8", c2: "#1f6fa6", draw: (k) => (<><rect width="160" height="90" fill={`url(#l-${k})`} /><rect y="50" width="160" height="40" fill="#f2dfb3" /><path d="M0 52 q40 6 80 0 t80 0 v6 H0z" fill="#3aa0d8" /><circle cx="30" cy="20" r="8" fill="#fff4cc" /></>) },
  window: { c1: "#2b2f38", c2: "#0c0d10", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><rect x="52" y="8" width="56" height="74" rx="22" fill="#15171c" /><rect x="58" y="14" width="44" height="62" rx="18" fill="#5aa8e8" /><rect x="58" y="50" width="44" height="26" rx="10" fill="#e9f2fa" opacity="0.9" /></>) },
  clouds: { c1: "#cfe6f7", c2: "#5a9fd6", draw: (k) => (<><rect width="160" height="90" fill={`url(#l-${k})`} /><ellipse cx="40" cy="60" rx="34" ry="14" fill="#fff" /><ellipse cx="90" cy="66" rx="40" ry="16" fill="#f4f9fd" /><ellipse cx="140" cy="58" rx="30" ry="12" fill="#fff" /><circle cx="130" cy="20" r="9" fill="#fff8d6" /></>) },
  steam: { c1: "#5a3d2a", c2: "#1a110a", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><ellipse cx="80" cy="66" rx="46" ry="14" fill="#e8dcc6" /><ellipse cx="80" cy="62" rx="36" ry="10" fill="#b8682d" /><path d="M60 50 q6 -14 0 -26 M78 48 q6 -14 0 -30 M96 50 q6 -14 0 -26" stroke="#ffffff66" strokeWidth="3" fill="none" strokeLinecap="round" /></>) },
  mountain: { c1: "#cfd8dd", c2: "#4a5a66", draw: (k) => (<><rect width="160" height="90" fill={`url(#l-${k})`} /><path d="M0 80 L40 30 L70 60 L100 22 L130 58 L160 40 V90 H0z" fill="#2f3d47" /><path d="M0 90 L30 74 L60 82 L90 70 L120 84 L160 72 V90z" fill="#e6ecef" opacity="0.8" /></>) },
  mirror: { c1: "#3a3a40", c2: "#101012", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><rect x="50" y="6" width="60" height="80" rx="30" fill="#8a8a92" /><rect x="55" y="11" width="50" height="70" rx="25" fill="#c9ced6" /><circle cx="80" cy="36" r="9" fill="#e8c9a8" /><rect x="66" y="48" width="28" height="30" rx="10" fill="#2d2d32" /></>) },
  outfit: { c1: "#c9a2b8", c2: "#3a1f2e", draw: (k) => (<><rect width="160" height="90" fill={`url(#g-${k})`} /><circle cx="80" cy="30" r="10" fill="#e8c9a8" /><path d="M62 44 h36 l8 46 H54z" fill="#e0483f" /><rect x="70" y="40" width="20" height="8" fill="#e8c9a8" /></>) },
};
