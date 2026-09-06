"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { track } from "@/lib/api";
import styles from "./CinematicHome.module.css";

const CHAPTERS = [
  { id: "coffee-ocean", title: ["A sip.", "An ocean."], label: "Dive through the coffee", from: "Morning coffee", to: "Open water", note: "A familiar detail. A completely different world.", type: "PORTAL / 001" },
  { id: "eye-space", title: ["One look.", "Deep space."], label: "Through the eye", from: "A closer look", to: "Another galaxy", note: "Go beyond what meets the eye.", type: "PORTAL / 002" },
  { id: "window-clouds", title: ["Inside.", "Wide open."], label: "Fly through the window", from: "Window seat", to: "Above the clouds", note: "Let the camera go where it couldn’t before.", type: "FLY THROUGH / 003" },
];
const FILMS = [
  { id: "coffee-ocean", name: "A deeper kind of coffee", type: "Portals", move: "Coffee → Ocean" },
  { id: "eye-space", name: "More than meets the eye", type: "Portals", move: "Eye → Space" },
  { id: "wheel-tunnel", name: "Never lose momentum", type: "Match cuts", move: "Wheel → Tunnel" },
  { id: "steam-fog", name: "Let the world dissolve", type: "Atmosphere", move: "Steam → Mountain fog" },
  { id: "window-clouds", name: "Take the window seat", type: "Portals", move: "Window → Clouds" },
  { id: "door-beach", name: "Somewhere else entirely", type: "Portals", move: "Door → Beach" },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const COFFEE_FILM = "/examples/coffee-ocean/after.mp4";
const DESKTOP_VIDEO_MEDIA = "(min-width: 1200px) and (pointer: fine)";

function VideoSources({ src }: { src: string }) {
  if (src !== COFFEE_FILM) return <source src={src} type="video/mp4" />;
  return <>
    {/* Put the lightweight version first so older browsers that ignore media stay on 720p. */}
    <source src={src} type="video/mp4" media="(max-width: 1199px), (pointer: coarse)" />
    <source src="/examples/coffee-ocean/after-4k.mp4" type="video/mp4" media={DESKTOP_VIDEO_MEDIA} />
    <source src={src} type="video/mp4" />
  </>;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" style={diagonal ? { transform: "rotate(-45deg)" } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Decode looping footage only while it is on screen and page motion is enabled. */
function AmbientVideo({ src, poster, enabled }: { src: string; poster: string; enabled: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    const sync = () => {
      if (visible && enabled && !document.hidden) {
        if (video.paused) void video.play().catch(() => {});
      } else if (!video.paused) video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.12 });
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); video.pause(); };
  }, [enabled, src]);
  return <video ref={ref} poster={poster} muted loop playsInline preload="none" aria-hidden="true"><VideoSources src={src} /></video>;
}

export function CinematicHome() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const story = useRef<HTMLElement>(null);
  const gallery = useRef<HTMLElement>(null);
  const storyVideos = useRef<(HTMLVideoElement | null)[]>([]);
  const [motion, setMotion] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [filter, setFilter] = useState("All moves");
  const [comparison, setComparison] = useState<"before" | "after">("after");
  const [playingFilm, setPlayingFilm] = useState<string | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    // Decorative loops do not need to keep running below the fold or in a background tab.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) (entry.target as HTMLElement).dataset.inView = String(entry.isIntersecting);
    });
    const sections = container.querySelectorAll<HTMLElement>(`section, .${styles.marquee}`);
    sections.forEach((section) => observer.observe(section));
    const visibility = () => { container.dataset.documentHidden = String(document.hidden); };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    if (!root.current) return;
    let frame = 0;
    let activeChapter = -1;
    const previous = new Map<string, string>();
    const setProgress = (element: HTMLElement | null, property: string, progress: number) => {
      const value = progress.toFixed(3);
      if (element && previous.get(property) !== value) {
        element.style.setProperty(property, value);
        previous.set(property, value);
      }
    };
    const paint = () => {
      frame = 0;
      if (!motion) {
        setProgress(hero.current, "--hero-progress", 0);
        setProgress(gallery.current, "--gallery-progress", 0);
        return;
      }
      if (document.hidden) return;
      const height = window.innerHeight;
      const heroBox = hero.current?.getBoundingClientRect();
      const storyBox = story.current?.getBoundingClientRect();
      const galleryBox = gallery.current?.getBoundingClientRect();
      // Keep custom property invalidation within the affected section, instead of the whole page.
      if (heroBox) setProgress(hero.current, "--hero-progress", clamp(-heroBox.top / height));
      if (galleryBox && galleryBox.top < height && galleryBox.bottom > 0) setProgress(gallery.current, "--gallery-progress", clamp((height - galleryBox.top) / (height + galleryBox.height)));
      if (storyBox && storyBox.top < height && storyBox.bottom > 72) {
        const progress = clamp((72 - storyBox.top) / Math.max(1, storyBox.height - height + 72));
        const index = Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length));
        const local = clamp(progress * CHAPTERS.length - index);
        if (index !== activeChapter) { activeChapter = index; setChapter(index); }
        setProgress(story.current, "--chapter-progress", local);
        const video = storyVideos.current[index];
        if (video && video.readyState >= 1 && Number.isFinite(video.duration) && !video.seeking) {
          const target = Math.max(0, video.duration - 0.06) * local;
          if (Math.abs(video.currentTime - target) > 0.065) video.currentTime = target;
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    const videos = storyVideos.current.filter((v): v is HTMLVideoElement => Boolean(v));
    videos.forEach((video) => { video.addEventListener("loadedmetadata", schedule); video.addEventListener("seeked", schedule); });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      videos.forEach((video) => { video.removeEventListener("loadedmetadata", schedule); video.removeEventListener("seeked", schedule); });
    };
  }, [motion]);

  const jumpToChapter = useCallback((index: number) => {
    if (!motion) { setChapter(index); return; }
    const section = story.current;
    if (!section) return;
    const distance = section.offsetHeight - window.innerHeight + 72;
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 72 + distance * (index / CHAPTERS.length + 0.005), behavior: "smooth" });
  }, [motion]);
  const currentChapter = CHAPTERS[chapter];
  const visibleFilms = FILMS.filter((film) => filter === "All moves" || film.type === filter);

  return <div className={styles.home} ref={root} data-motion={motion}>
    <section className={styles.hero} ref={hero}>
      <div className={styles.heroTop}><span className={styles.eyebrow}><i /> YOUR AI TRANSITION DIRECTOR</span><button className={styles.motionToggle} onClick={() => setMotion((value) => !value)} aria-pressed={motion} aria-label={motion ? "Pause page animations" : "Enable page animations"}><span className={styles.motionBars} aria-hidden="true"><i /><i /><i /></span>Motion {motion ? "on" : "off"}</button></div>
      <div className={styles.heroHeading}><h1>Make the cut.<br /><span>Break reality.</span><sup>↗</sup></h1><div className={styles.heroIntro}><p>Two clips. A connection<br />you never saw coming.</p><p className={styles.heroDescription}>Seam turns the space between your shots into the part they remember.</p><Link href="/create" className={styles.primaryLink}>Make your first transition <Arrow /></Link></div></div>
      <div className={styles.heroStage}>
        <div className={styles.stageGrid} aria-hidden="true" />
        <div className={`${styles.sourceCard} ${styles.sourceA}`}><img src="/examples/coffee-ocean/frame_a.jpg" alt="A warm cup of coffee, the opening shot" /><div className={styles.sourceCaption}><span>01 / IN</span><span>The everyday.</span></div></div>
        <div className={`${styles.sourceCard} ${styles.sourceB}`}><img src="/examples/coffee-ocean/frame_b.jpg" alt="Ocean waves, the destination shot" /><div className={styles.sourceCaption}><span>02 / OUT</span><span>The unexpected.</span></div></div>
        <div className={styles.mainFilm}><AmbientVideo src="/examples/coffee-ocean/after.mp4" poster="/examples/coffee-ocean/poster.jpg" enabled={motion} /><div className={styles.filmTopline}><span><i /> THE IN-BETWEEN</span><span>SEAM — 001</span></div><div className={styles.filmBottomline}><span>Coffee, meet ocean.</span><a href="#explore" aria-label="Explore the coffee to ocean transition"><Arrow diagonal /></a></div></div>
        <span className={styles.orbitLabel}><span>✳</span> One impossible shot.</span><div className={styles.timelineTag} aria-hidden="true"><span>CLIP A</span><i /><b>SEAM</b><i /><span>CLIP B</span></div>
      </div>
      <div className={styles.heroBottom}><a href="#explore"><span className={styles.scrollArrow}>↓</span> SCROLL TO CHANGE THE SCENE</a><span>YOUR FOOTAGE. A NEW POINT OF VIEW.</span><span className={styles.coordinates}>ALWAYS IN MOTION ↗</span></div>
    </section>
    <div className={styles.marquee} aria-hidden="true"><div>{Array.from({ length: 4 }, (_, i) => <span key={i}>LESS CUT. MORE CONNECTION. <b>✳</b> KEEP THEM WATCHING. <b>✳</b> </span>)}</div></div>
    <section id="explore" className={styles.story} ref={story} aria-label="Explore transitions by scrolling"><div className={styles.storySticky}>
      <div className={styles.storyVisual}>{CHAPTERS.map((item, index) => <div className={styles.chapterFilm} key={item.id} data-active={chapter === index} aria-hidden="true"><video ref={(element) => { storyVideos.current[index] = element; }} poster={`/examples/${item.id}/poster.jpg`} muted playsInline preload="metadata"><VideoSources src={`/examples/${item.id}/after.mp4`} /></video></div>)}</div><div className={styles.storyShade} />
      <div className={styles.storyTopline}><span className={styles.eyebrow}>THE SPACE BETWEEN</span><span className={styles.storyInstruction}>{motion ? "YOUR SCROLL IS THE PLAYHEAD" : "SELECT A SCENE BELOW"} <span>↓</span></span></div>
      <div className={styles.storyCopy} key={currentChapter.id}><span className={styles.chapterNumber}>{currentChapter.type}</span><h2>{currentChapter.title[0]}<br /><em>{currentChapter.title[1]}</em></h2><p>{currentChapter.note}</p><Link href="/create" className={styles.lightLink}>Make a connection <Arrow /></Link></div>
      <div className={styles.frameReticle} aria-hidden="true"><span /><span /><span /><span /></div>
      <div className={styles.storyControls}><div className={styles.storySceneMeta}><span>{currentChapter.from}</span><div><i /><span>SEAM</span><i /></div><span>{currentChapter.to}</span></div><div className={styles.storyChapters}>{CHAPTERS.map((item, index) => <button key={item.id} className={styles.chapterButton} data-active={chapter === index} onClick={() => jumpToChapter(index)} aria-pressed={chapter === index}><span>0{index + 1}</span><span>{item.label}</span><i><b /></i></button>)}</div><a className={styles.skipStory} href="#how-it-works">Skip to how it works <Arrow /></a></div>
    </div></section>
    <section id="how-it-works" className={styles.process}>
      <div className={styles.processHeading}><span className={styles.eyebrow}>A LITTLE INPUT. A LOT OF POSSIBILITY.</span><h2>You bring the clips.<br />We find the <em>connection.</em></h2><p>No keyframes. No endless timeline.<br />Just a beginning, an ending, and a little imagination.</p></div>
      <div className={styles.processGrid}>
        <article className={styles.processCard}><div className={`${styles.processArt} ${styles.pairArt}`}><img src="/examples/coffee-ocean/frame_a.jpg" alt="Opening coffee clip" loading="lazy" /><img src="/examples/coffee-ocean/frame_b.jpg" alt="Closing ocean clip" loading="lazy" /><span>+</span></div><span className={styles.stepNumber}>01 / THE RAW MATERIAL</span><h3>Start here. End anywhere.</h3><p>Drop in your two clips. The last moment of one meets the first moment of the next.</p></article>
        <article className={styles.processCard}><div className={`${styles.processArt} ${styles.connectionArt}`}><div className={styles.wireOrb}><i /><i /><i /><i /></div><span className={styles.connectionLabel}>FINDING YOUR THROUGH LINE</span><div className={styles.ideaTag}>↗ Dive through the coffee</div></div><span className={styles.stepNumber}>02 / THE CREATIVE DIRECTION</span><h3>Follow the unexpected.</h3><p>Choose a move that fits your footage. Keep it subtle, go cinematic, or push it further.</p></article>
        <article className={styles.processCard}><div className={`${styles.processArt} ${styles.outputArt}`}><AmbientVideo src="/examples/coffee-ocean/after.mp4" poster="/examples/coffee-ocean/poster.jpg" enabled={motion} /><span>ONE CONTINUOUS MOVE <Arrow diagonal /></span></div><span className={styles.stepNumber}>03 / THE FINAL CUT</span><h3>Make it yours.</h3><p>Preview the connection, fine-tune the energy, and take your finished edit with you.</p></article>
      </div><Link href="/create" className={styles.darkLink}>Let’s see your clips <Arrow /></Link>
    </section>
    <section id="examples" className={styles.gallery} ref={gallery}>
      <div className={styles.galleryHeading}><div><span className={styles.eyebrow}>THE POSSIBILITY REEL</span><h2>Same world.<br /><span>Different rules.</span></h2></div><p>Small details become doorways.<br />Find your next “how did they do that?”</p></div>
      <div className={styles.filters}>{["All moves", "Portals", "Match cuts", "Atmosphere"].map((item) => <button key={item} data-active={filter === item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}{item === "All moves" && <span>06</span>}</button>)}<Link href="/library">Explore the library <Arrow diagonal /></Link></div>
      <div className={styles.filmGrid}>{visibleFilms.map((film, index) => <article className={styles.reelCard} key={film.id} style={{ "--card-index": index } as CSSProperties}><button className={styles.reelVisual} onClick={() => { setPlayingFilm(film.id); setComparison("after"); track("example_switched", { id: film.id }); }} aria-label={`Watch ${film.move} before and after`}><AmbientVideo src={`/examples/${film.id}/after.mp4`} poster={`/examples/${film.id}/poster.jpg`} enabled={motion} /><span className={styles.reelType}>{film.type}</span><span className={styles.watchFilm}><span>↗</span> Watch the cut</span></button><div className={styles.reelDetails}><h3>{film.name}</h3><span>{film.move}</span></div></article>)}</div>
      <div className={styles.galleryNote}><span>Rendered examples. Your clips will find their own way through.</span><span>BUILT FOR THE DOUBLE TAKE. ↗</span></div>
    </section>
    <section className={styles.finalCta}><div className={styles.endMark} aria-hidden="true">✳</div><span className={styles.eyebrow}>MAKE SOMETHING THEY FEEL.</span><h2>The next great shot<br />is <em>between</em> your shots.</h2><Link href="/create" className={styles.primaryLink}>Find your connection <Arrow /></Link><span className={styles.finalNote}>Two clips. One place to start.</span></section>
    {playingFilm && <FilmDialog id={playingFilm} mode={comparison} motion={motion} onMode={setComparison} onClose={() => setPlayingFilm(null)} />}
  </div>;
}

function FilmDialog({ id, mode, motion, onMode, onClose }: { id: string; mode: "before" | "after"; motion: boolean; onMode: (mode: "before" | "after") => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const film = FILMS.find((item) => item.id === id)!;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; element?.close(); };
  }, []);
  useEffect(() => { if (motion) void video.current?.play().catch(() => {}); }, [mode, motion]);
  return <dialog className={styles.dialog} ref={dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-label={`${film.move} before and after`}><div className={styles.dialogInside}><div className={styles.dialogTop}><div><span className={styles.eyebrow}>THE POSSIBILITY REEL</span><h2>{film.move}</h2></div><button onClick={onClose} aria-label="Close example">✕</button></div><video key={`${id}-${mode}`} ref={video} poster={`/examples/${id}/poster.jpg`} controls muted loop playsInline preload="metadata"><VideoSources src={`/examples/${id}/${mode}.mp4`} /></video><div className={styles.dialogBottom}><div className={styles.comparisonToggle}><button data-active={mode === "before"} aria-pressed={mode === "before"} onClick={() => onMode("before")}>Before / Hard cut</button><button data-active={mode === "after"} aria-pressed={mode === "after"} onClick={() => onMode("after")}>After / Seam</button></div><Link href="/create" className={styles.primaryLink}>Try your clips <Arrow /></Link></div></div></dialog>;
}
