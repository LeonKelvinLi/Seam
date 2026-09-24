"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/api";
import styles from "./CinematicHome.module.css";

const CHAPTERS = [
  { id: "eye-space", title: ["One look.", "Deep space."], label: "Through the eye", from: "A closer look", to: "Another galaxy", note: "Go beyond what meets the eye.", type: "PORTAL / 001" },
  { id: "window-clouds", title: ["Inside.", "Wide open."], label: "Fly through the window", from: "Window seat", to: "Above the clouds", note: "Let the camera go where it couldn’t before.", type: "FLY THROUGH / 002" },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const COFFEE_FILM = "/examples/coffee-ocean/after.mp4";
const DESKTOP_VIDEO_MEDIA = "(min-width: 1200px) and (pointer: fine)";

/** The hero film streams as a plain loop, so desktops can take its 4K file; phones get the lighter 720p one. */
function VideoSources({ src }: { src: string }) {
  if (src !== COFFEE_FILM) return <source src={src} type="video/mp4" />;
  return <>
    <source src={src.replace("/after.mp4", "/after-mobile.mp4")} type="video/mp4" media="(max-width: 1199px), (pointer: coarse)" />
    <source src={src.replace("/after.mp4", "/after-4k.mp4")} type="video/mp4" media={DESKTOP_VIDEO_MEDIA} />
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
  const storyStage = useRef<HTMLDivElement>(null);
  const storyVideos = useRef<(HTMLVideoElement | null)[]>([]);
  const [motion, setMotion] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [comparison, setComparison] = useState<"before" | "after">("after");
  const [playingFilm, setPlayingFilm] = useState<string | null>(null);
  // How much of the scene has downloaded, shown only while the picture cannot follow the scroll: a still frame with no
  // transition reads as broken, so the wait says what it is.
  const [loadingPercent, setLoadingPercent] = useState<number | null>(null);
  const shownTime = useRef<number[]>([]);
  const bufferedPercent = useRef<number[]>([]);

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
    const sections = container.querySelectorAll<HTMLElement>("section");
    sections.forEach((section) => observer.observe(section));
    const visibility = () => { container.dataset.documentHidden = String(document.hidden); };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  // Scrubbing reads a new frame at every scroll step, so the story films start on the 720p files with a keyframe every
  // 0.5 s, which seek smoothly even over the network. Desktops then download the sharp version (1440p cut from the Topaz
  // 4K master, a keyframe every 5 frames) whole in the background and switch to it, so its seeks come from memory.
  // Pointing the videos at a sharp file over the network froze scrubbing: every seek waited on a range request.
  const pendingHd = useRef(new Map<number, string>());
  const onScreen = useRef(-1);
  // A chapter keeps its current file while it is on screen, since switching src mid-scrub would flash the poster frame.
  const applyHd = useCallback(() => {
    for (const [index, url] of pendingHd.current) {
      const video = storyVideos.current[index];
      if (!video || index === onScreen.current) continue;
      video.src = url;
      pendingHd.current.delete(index);
    }
  }, []);

  useEffect(() => {
    const section = story.current;
    if (!section) return;
    const desktop = window.matchMedia(DESKTOP_VIDEO_MEDIA).matches;
    const controller = new AbortController();
    const urls: string[] = [];
    const pending = pendingHd.current;
    const download = async () => {
      for (let index = 0; index < CHAPTERS.length; index++) {
        const res = await fetch(`/examples/${CHAPTERS[index].id}/after-hd.mp4`, { signal: controller.signal });
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        urls.push(url);
        pending.set(index, url);
        applyHd();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      // Buffer the scrub files before the story arrives: a scene scrolled into cold shows a still frame, not a transition.
      for (const video of storyVideos.current) { if (video) { video.preload = "auto"; video.load(); } }
      if (desktop) download().catch(() => {});
    }, { rootMargin: "100% 0px" });
    observer.observe(section);
    return () => { observer.disconnect(); controller.abort(); pending.clear(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [applyHd]);

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
    // The playhead eases toward the scroll position instead of jumping to it, so a wheel notch glides through the
    // footage rather than skipping ahead; EASE_SEC is the time constant of that glide.
    const EASE_SEC = 0.3;
    let shown = -1;
    let last = 0;
    let loading: number | null = null;
    const covers = (video: HTMLVideoElement, time: number) => {
      for (let r = 0; r < video.buffered.length; r++) if (time >= video.buffered.start(r) - 0.05 && time <= video.buffered.end(r) + 0.05) return true;
      return false;
    };
    const paint = (now: number) => {
      frame = 0;
      if (!motion) {
        setProgress(hero.current, "--hero-progress", 0);
        return;
      }
      if (document.hidden) return;
      const height = window.innerHeight;
      const heroBox = hero.current?.getBoundingClientRect();
      const storyBox = story.current?.getBoundingClientRect();
      // Keep custom property invalidation within the affected section, instead of the whole page.
      if (heroBox) setProgress(hero.current, "--hero-progress", clamp(-heroBox.top / height));
      if (!storyBox || storyBox.top >= height || storyBox.bottom <= 72) {
        shown = -1; last = 0; onScreen.current = -1;
        if (pendingHd.current.size) applyHd();
        if (loading !== null) { loading = null; setLoadingPercent(null); }
        return;
      }
      const stageHeight = storyStage.current?.offsetHeight ?? height - 72;
      const target = clamp((72 - storyBox.top) / Math.max(1, storyBox.height - stageHeight));
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      shown = shown < 0 ? target : shown + (target - shown) * (1 - Math.exp(-dt / EASE_SEC));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      last = shown === target ? 0 : now;
      const index = Math.min(CHAPTERS.length - 1, Math.floor(shown * CHAPTERS.length));
      const local = clamp(shown * CHAPTERS.length - index);
      if (index !== activeChapter) { activeChapter = index; setChapter(index); }
      onScreen.current = index;
      if (pendingHd.current.size) applyHd();
      setProgress(story.current, "--chapter-progress", local);
      const video = storyVideos.current[index];
      const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
      if (video && video.readyState >= 1 && duration > 0 && !video.seeking) {
        const time = Math.max(0, duration - 0.06) * local;
        if (Math.abs(video.currentTime - time) > 0.065) video.currentTime = time;
      }
      // What the visitor sees is the frame that painted, not the time we asked for. While that frame cannot follow the
      // scroll, show how much of the scene has arrived: a still frame with no transition reads as broken.
      const wanted = duration * local;
      const ready = !!video && duration > 0 && video.readyState >= 2 && covers(video, wanted);
      const painted = shownTime.current[index];
      const behind = !ready || (painted !== undefined && Math.abs(painted - wanted) > 0.6);
      const percent = bufferedPercent.current[index] ?? 0;
      const next = behind && percent < 100 ? percent : null;
      if (next !== loading) { loading = next; setLoadingPercent(next); }
      if (shown !== target) schedule();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (callback: (now: number, meta: { mediaTime: number }) => void) => number };
    const videos: { video: HTMLVideoElement; index: number }[] = [];
    storyVideos.current.forEach((video, index) => { if (video) videos.push({ video, index }); });
    const measure = () => {
      for (const { video, index } of videos) {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        let end = 0;
        for (let r = 0; r < video.buffered.length; r++) end = Math.max(end, video.buffered.end(r));
        bufferedPercent.current[index] = duration > 0 && (end >= duration - 0.3 || video.readyState >= 4) ? 100 : Math.min(99, Math.round((end / (duration || 1)) * 100));
      }
      schedule();
    };
    for (const { video, index } of videos) {
      video.addEventListener("loadedmetadata", measure);
      video.addEventListener("progress", measure);
      video.addEventListener("canplaythrough", measure);
      video.addEventListener("seeked", schedule);
      // requestVideoFrameCallback reports the frame that reached the screen; currentTime moves even when nothing paints.
      const seen = (_now: number, meta: { mediaTime: number }) => {
        shownTime.current[index] = meta.mediaTime;
        (video as FrameVideo).requestVideoFrameCallback?.(seen);
      };
      (video as FrameVideo).requestVideoFrameCallback?.(seen);
    }
    measure();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      for (const { video } of videos) {
        video.removeEventListener("loadedmetadata", measure);
        video.removeEventListener("progress", measure);
        video.removeEventListener("canplaythrough", measure);
        video.removeEventListener("seeked", schedule);
      }
    };
  }, [motion, applyHd]);

  const jumpToChapter = useCallback((index: number) => {
    if (!motion) { setChapter(index); return; }
    const section = story.current;
    if (!section) return;
    const distance = section.offsetHeight - (storyStage.current?.offsetHeight ?? window.innerHeight - 72);
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 72 + distance * (index / CHAPTERS.length + 0.005), behavior: "smooth" });
  }, [motion]);
  const currentChapter = CHAPTERS[chapter];

  return <div className={styles.home} ref={root} data-motion={motion}>
    <section className={styles.hero} ref={hero}>
      <div className={styles.heroTop}><span className={styles.eyebrow}><i /> YOUR AI TRANSITION DIRECTOR</span><button className={styles.motionToggle} onClick={() => setMotion((value) => !value)} aria-pressed={motion} aria-label={motion ? "Pause page animations" : "Enable page animations"}><span className={styles.motionBars} aria-hidden="true"><i /><i /><i /></span>Motion {motion ? "on" : "off"}</button></div>
      <div className={styles.heroHeading}><h1>Make the cut.<br /><span>Break reality.</span><sup>↗</sup></h1><div className={styles.heroIntro}><p>Drop two clips. <br />AI makes the shot in between.</p><p className={styles.heroDescription}>Your footage stays real. Clipmelt generates only the transition, checks it, and hands back one clip.</p><Link href="/create" data-cta="hero" className={styles.primaryLink}>Try it free <Arrow /></Link><p className={styles.heroOffer}>3 free transitions · no signup · then $9 for 15</p></div></div>
      <div className={styles.heroStage}>
        <div className={styles.stageGrid} aria-hidden="true" />
        <div className={`${styles.sourceCard} ${styles.sourceA}`}><img src="/examples/coffee-ocean/frame_a.jpg" alt="A warm cup of coffee, the opening shot" /><div className={styles.sourceCaption}><span>01 / IN</span><span>The everyday.</span></div></div>
        <div className={`${styles.sourceCard} ${styles.sourceB}`}><img src="/examples/coffee-ocean/frame_b.jpg" alt="Ocean waves, the destination shot" /><div className={styles.sourceCaption}><span>02 / OUT</span><span>The unexpected.</span></div></div>
        <div className={styles.mainFilm}><AmbientVideo src="/examples/coffee-ocean/after.mp4" poster="/examples/coffee-ocean/poster.jpg" enabled={motion} /><div className={styles.filmTopline}><span><i /> THE IN-BETWEEN</span><span>BRIDGE — 001</span></div><div className={styles.filmBottomline}><span>Coffee, meet ocean.</span><button onClick={() => { setPlayingFilm("coffee-ocean"); setComparison("after"); track("example_switched", { id: "coffee-ocean" }); }} aria-label="Watch Coffee to Ocean before and after"><Arrow diagonal /></button></div></div>
        <span className={styles.orbitLabel}><span>✳</span> One seamless connection.</span><div className={styles.timelineTag} aria-hidden="true"><span>CLIP A</span><i /><b>BRIDGE</b><i /><span>CLIP B</span></div>
      </div>
      <div className={styles.heroBottom}><a href="#explore"><span className={styles.scrollArrow}>↓</span> SCROLL TO CHANGE THE SCENE</a><span>YOUR FOOTAGE. A NEW POINT OF VIEW.</span><span className={styles.coordinates}>ALWAYS IN MOTION ↗</span></div>
    </section>
    <section id="explore" className={styles.story} ref={story} aria-label="Explore transitions by scrolling"><div className={styles.storySticky} ref={storyStage}>
      <div className={styles.storyVisual}>{CHAPTERS.map((item, index) => <div className={styles.chapterFilm} key={item.id} data-active={chapter === index} aria-hidden="true"><video ref={(element) => { storyVideos.current[index] = element; }} poster={`/examples/${item.id}/poster.jpg`} muted playsInline preload="metadata"><source src={`/examples/${item.id}/after-mobile.mp4`} type="video/mp4" /></video></div>)}</div><div className={styles.storyShade} />
      {loadingPercent !== null && <div className={styles.storyLoading} role="status" aria-live="polite"><span>Loading the scene {loadingPercent}%</span><i><b style={{ width: `${loadingPercent}%` }} /></i></div>}
      <div className={styles.storyTopline}><span className={styles.eyebrow}>THE SPACE BETWEEN</span><span className={styles.storyInstruction}>{motion ? "YOUR SCROLL IS THE PLAYHEAD" : "SELECT A SCENE BELOW"} <span>↓</span></span></div>
      <div className={styles.storyCopy} key={currentChapter.id}><span className={styles.chapterNumber}>{currentChapter.type}</span><h2>{currentChapter.title[0]}<br /><em>{currentChapter.title[1]}</em></h2><p>{currentChapter.note}</p><Link href="/create" className={styles.lightLink}>Make a connection <Arrow /></Link></div>
      <div className={styles.frameReticle} aria-hidden="true"><span /><span /><span /><span /></div>
      <div className={styles.storyControls}><div className={styles.storySceneMeta}><span>{currentChapter.from}</span><div><i /><span>BRIDGE</span><i /></div><span>{currentChapter.to}</span></div><div className={styles.storyChapters}>{CHAPTERS.map((item, index) => <button key={item.id} className={styles.chapterButton} data-active={chapter === index} onClick={() => jumpToChapter(index)} aria-pressed={chapter === index}><span>0{index + 1}</span><span>{item.label}</span><i><b /></i></button>)}</div><a className={styles.skipStory} href="#how-it-works">Skip to how it works <Arrow /></a></div>
    </div></section>
    <section id="how-it-works" className={styles.process}>
      <div className={styles.processHeading}><span className={styles.eyebrow}>FROM CLIPS TO CONNECTION</span><h2>Your next edit,<br /><em>in three steps.</em></h2></div>
      <ol className={styles.processSteps}>
        <li><span className={styles.stepNumber}>01</span><div><h3>Bring your clips.</h3><p>Choose where the shot starts and ends.</p></div></li>
        <li><span className={styles.stepNumber}>02</span><div><h3>Pick your move.</h3><p>Find a connection that fits your footage.</p></div></li>
        <li><span className={styles.stepNumber}>03</span><div><h3>Make the cut.</h3><p>Preview, fine-tune, and export.</p></div></li>
      </ol>
      <div className={styles.processActions}><Link href="/create" className={styles.darkLink}>Open studio <Arrow /></Link><Link href="/library" className={styles.libraryLink}>Explore all transitions <Arrow diagonal /></Link></div>
    </section>
    {playingFilm && <FilmDialog id={playingFilm} mode={comparison} motion={motion} onMode={setComparison} onClose={() => setPlayingFilm(null)} />}
  </div>;
}

function FilmDialog({ id, mode, motion, onMode, onClose }: { id: string; mode: "before" | "after"; motion: boolean; onMode: (mode: "before" | "after") => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const title = "Coffee → Ocean";
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; element?.close(); };
  }, []);
  useEffect(() => { if (motion) void video.current?.play().catch(() => {}); }, [mode, motion]);
  return <dialog className={styles.dialog} ref={dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-label={`${title} before and after`}><div className={styles.dialogInside}><div className={styles.dialogTop}><div><span className={styles.eyebrow}>THE POSSIBILITY REEL</span><h2>{title}</h2></div><button onClick={onClose} aria-label="Close example">✕</button></div><video key={`${id}-${mode}`} ref={video} poster={`/examples/${id}/poster.jpg`} controls muted loop playsInline preload="metadata"><VideoSources src={`/examples/${id}/${mode}.mp4`} /></video><div className={styles.dialogBottom}><div className={styles.comparisonToggle}><button data-active={mode === "before"} aria-pressed={mode === "before"} onClick={() => onMode("before")}>Before / Hard cut</button><button data-active={mode === "after"} aria-pressed={mode === "after"} onClick={() => onMode("after")}>After / Clipmelt</button></div><Link href="/create" className={styles.primaryLink}>Try your clips <Arrow /></Link></div></div></dialog>;
}
