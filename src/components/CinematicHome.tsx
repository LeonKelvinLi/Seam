"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { track } from "@/lib/api";
import styles from "./CinematicHome.module.css";

const FILMS = [
  {
    id: "coffee-ocean",
    title: "Coffee into coastline",
    kind: "Portal",
    start: "Coffee",
    end: "Ocean",
  },
  {
    id: "eye-space",
    title: "A look into another universe",
    kind: "Zoom through",
    start: "Eye",
    end: "Space",
  },
  {
    id: "window-clouds",
    title: "Beyond the window seat",
    kind: "Fly through",
    start: "Window",
    end: "Mountains",
  },
  {
    id: "wheel-tunnel",
    title: "Take the unexpected route",
    kind: "Match transition",
    start: "Wheel",
    end: "Tunnel",
  },
];
const FAQ = [
  [
    "What does the AI actually make?",
    "The transition between your two shots. You supply the beginning and the end; Clipmelt generates the connecting footage. Download the transition on its own or the combined video.",
  ],
  [
    "Can I try it without signing up?",
    "Yes. Your first preview transition is free, with no signup. Bring two clips or start with a sample pair in the studio.",
  ],
  [
    "How long does a transition take?",
    "Usually a few minutes. Clipmelt analyzes your shots, generates the transition, and checks the result before showing your preview.",
  ],
  [
    "What happens if generation fails?",
    "If a generation fails or doesn't pass the quality check, its credits are returned to your balance. You can try another pair of clips.",
  ],
  [
    "How do credits work?",
    "A preview uses 2 credits. Credit packs start at $9 for 12 credits, enough for 6 previews. Credits don't expire and there is no subscription. Making another version uses credits too.",
  ],
];
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function Icon({
  name = "arrow",
}: {
  name?: "arrow" | "play" | "plus" | "pause";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      {name === "play" ? (
        <path d="m9 5 10 7-10 7V5Z" fill="currentColor" />
      ) : name === "pause" ? (
        <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3" />
      ) : name === "plus" ? (
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path
          d="M4 12h15m-6-6 6 6-6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function FilmLoop({ enabled }: { enabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    let visible = false;
    const sync = () => {
      if (enabled && visible && !document.hidden)
        void node.play().catch(() => {});
      else node.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      node.pause();
    };
  }, [enabled]);
  return (
    <video
      ref={video}
      src={enabled ? "/examples/coffee-ocean/after-mobile.mp4" : undefined}
      poster="/examples/coffee-ocean/poster.jpg"
      muted
      loop
      playsInline
      preload="none"
      aria-label="Example: coffee connected to ocean with an AI transition"
    />
  );
}

/** Scroll updates only the moving scene, and stops scheduling work when the page is at rest. */
function useSceneMotion(
  root: React.RefObject<HTMLDivElement | null>,
  scrub: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const sections = Array.from(
      node.querySelectorAll<HTMLElement>("[data-scene]"),
    );
    const stage = node.querySelector<HTMLElement>("[data-scrub-stage]");
    const scrubScene = sections.find(
      (section) => section.dataset.scene === "scrub",
    );
    let frame = 0;
    let latestTime = 0;
    let geometryDirty = true;
    let target = 0;
    let position: number | null = null;
    let previousFrame = 0;
    const render = (time: number) => {
      frame = 0;
      node.dataset.documentHidden = String(document.hidden);
      if (document.hidden) {
        previousFrame = 0;
        return;
      }
      if (geometryDirty) {
        geometryDirty = false;
        const height = window.innerHeight;
        // Read geometry together before changing any scene styles. Interleaving
        // reads and writes makes the browser lay out the page during scrolling.
        const stageHeight = stage?.offsetHeight ?? height - 72;
        const geometry = sections.map((section) => ({
          section,
          rect: section.getBoundingClientRect(),
        }));
        for (const { section, rect } of geometry) {
          const progress = enabled
            ? clamp((height - rect.top) / (height + rect.height))
            : 0.5;
          section.style.setProperty("--progress", progress.toFixed(4));
          section.dataset.visible = String(
            rect.top < height && rect.bottom > 0,
          );
          if (section.dataset.scene === "scrub") {
            target = enabled
              ? clamp((72 - rect.top) / Math.max(1, rect.height - stageHeight))
              : 0;
          }
        }
      }
      const elapsed = previousFrame ? Math.min(64, time - previousFrame) : 16;
      previousFrame = time;
      // Ease the visual playhead, never the document scroll. Stop the loop as
      // soon as it settles, and read layout only on actual scroll/resize events.
      position =
        position === null || !enabled
          ? target
          : position + (target - position) * (1 - Math.exp(-elapsed / 160));
      const settling = Math.abs(target - position) > 0.0005;
      if (!settling) position = target;
      scrubScene?.style.setProperty("--scrub", position.toFixed(4));
      const video = scrub.current;
      if (enabled && video && Number.isFinite(video.duration)) {
        latestTime = position * Math.max(0, video.duration - 0.05);
        if (!video.seeking && Math.abs(video.currentTime - latestTime) > 1 / 30)
          video.currentTime = latestTime;
      }
      if (settling) frame = requestAnimationFrame(render);
    };
    const schedule = () => {
      geometryDirty = true;
      if (!frame) frame = requestAnimationFrame(render);
    };
    const seek = () => {
      if (
        enabled &&
        scrub.current &&
        Math.abs(scrub.current.currentTime - latestTime) > 1 / 30
      )
        if (!frame) frame = requestAnimationFrame(render);
    };
    const video = scrub.current;
    video?.addEventListener("loadedmetadata", schedule);
    video?.addEventListener("seeked", seek);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries)
        (entry.target as HTMLElement).dataset.visible = String(
          entry.isIntersecting,
        );
    });
    sections.forEach((section) => observer.observe(section));
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      video?.removeEventListener("loadedmetadata", schedule);
      video?.removeEventListener("seeked", seek);
    };
  }, [enabled, root, scrub]);
}

export function CinematicHome() {
  const root = useRef<HTMLDivElement>(null);
  const assembly = useRef<HTMLDivElement>(null);
  const scrub = useRef<HTMLVideoElement>(null);
  const scrubSection = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [scrubLoaded, setScrubLoaded] = useState(false);
  const [scrubError, setScrubError] = useState(false);
  const [loadScrub, setLoadScrub] = useState(false);
  const [film, setFilm] = useState<string | null>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setMotion(!preference.matches);
      setMotionReady(true);
    };
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!motion || !scrubSection.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadScrub(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(scrubSection.current);
    return () => observer.disconnect();
  }, [motion]);
  useSceneMotion(root, scrub, motion);
  const openFilm = (id: string) => {
    setFilm(id);
    track("example_switched", { id });
  };

  return (
    <div
      className={styles.home}
      ref={root}
      data-motion={motionReady ? motion : undefined}
      data-film-open={Boolean(film)}
    >
      <section className={styles.hero} data-scene="hero">
        <div className={styles.heroToolbar}>
          <span className={styles.productLabel}>
            <span /> Made for the moment between
          </span>
          <button
            type="button"
            className={styles.motionToggle}
            onClick={() => setMotion(!motion)}
            aria-pressed={motion}
            aria-label={
              motion ? "Pause page animations" : "Enable page animations"
            }
          >
            <Icon name={motion ? "pause" : "play"} /> Motion{" "}
            {motion ? "on" : "off"}
          </button>
        </div>
        <div className={styles.heroCopy}>
          <h1>
            AI transitions
            <br />
            between your clips.
          </h1>
          <p>
            You shoot the moments. Clipmelt creates the impossible
            <br className={styles.desktopBreak} /> move that connects them. Your
            footage stays yours.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primary} data-cta="hero" href="/create">
              Create a transition <Icon />
            </Link>
            <button
              className={styles.secondary}
              onClick={() => openFilm("coffee-ocean")}
            >
              <Icon name="play" /> See it in action
            </button>
          </div>
          <span className={styles.offer}>
            Your first preview is free. No signup required.
          </span>
        </div>
        <div
          className={styles.assemblyWrap}
          onPointerMove={(event) => {
            if (!motion || event.pointerType !== "mouse" || !assembly.current)
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            assembly.current.style.setProperty(
              "--pointer-x",
              ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3),
            );
            assembly.current.style.setProperty(
              "--pointer-y",
              ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3),
            );
          }}
          onPointerLeave={() => {
            assembly.current?.style.setProperty("--pointer-x", "0");
            assembly.current?.style.setProperty("--pointer-y", "0");
          }}
        >
          <div className={styles.assembly} ref={assembly}>
            <div className={styles.orbit} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <figure className={`${styles.source} ${styles.sourceA}`}>
              <div className={styles.sourceLabel}>
                <span className={styles.sourceDot} /> Your first clip{" "}
                <span>A</span>
              </div>
              <img
                src="/examples/coffee-ocean/frame_a.jpg"
                alt="Coffee swirling inside a cup"
                width="640"
                height="360"
              />
              <figcaption>Starts in your world.</figcaption>
            </figure>
            <figure className={`${styles.source} ${styles.sourceB}`}>
              <div className={styles.sourceLabel}>
                <span className={styles.sourceDot} /> Your next clip{" "}
                <span>B</span>
              </div>
              <img
                src="/examples/coffee-ocean/frame_b.jpg"
                alt="An aerial view of ocean waves"
                width="640"
                height="360"
              />
              <figcaption>Ends somewhere new.</figcaption>
            </figure>
            <div className={styles.bridgeLayer} aria-hidden="true" />
            <div className={styles.bridgeLayerTwo} aria-hidden="true" />
            <div className={styles.output}>
              <div className={styles.outputBar}>
                <span className={styles.aiDot} /> Connected with AI{" "}
                <span>Coffee → Ocean</span>
              </div>
              <FilmLoop enabled={motion && !film} />
              <button
                className={styles.playButton}
                onClick={() => openFilm("coffee-ocean")}
                aria-label="Watch coffee to ocean before and after"
              >
                <Icon name="play" />
              </button>
              <div className={styles.outputCaption}>
                <span>Your clips. A new connection.</span>
                <span>Watch the result</span>
              </div>
            </div>
            <div className={styles.floatingTag}>
              <span className={styles.spark}>✳</span>
              <div>
                Only the in-between.<small>That’s the part AI makes.</small>
              </div>
            </div>
          </div>
        </div>
        <div
          className={styles.editTimeline}
          aria-label="Your first clip, AI-generated transition, your second clip"
        >
          <span>Your clip A</span>
          <div className={styles.timelineA} />
          <div className={styles.timelineAi}>
            <i /> AI transition <i />
          </div>
          <div className={styles.timelineB} />
          <span>Your clip B</span>
          <b className={styles.playhead} aria-hidden="true" />
        </div>
        <div className={styles.heroFoot}>
          <a href="#the-transition">
            Scroll into the transition <span aria-hidden="true">↓</span>
          </a>
          <Link href="/create?sample=coffee-ocean" data-cta="hero_sample">
            No footage handy? Try our sample clips <Icon />
          </Link>
        </div>
      </section>

      <section
        id="the-transition"
        ref={scrubSection}
        className={styles.scrubSection}
        data-scene="scrub"
        aria-labelledby="scrub-title"
      >
        <div className={styles.scrubSticky} data-scrub-stage>
          <div className={styles.scrubFilm}>
            <video
              ref={scrub}
              src={
                loadScrub
                  ? "/examples/window-clouds/after-mobile.mp4"
                  : undefined
              }
              poster="/examples/window-clouds/poster.jpg"
              muted
              playsInline
              preload={loadScrub ? "auto" : "none"}
              onLoadedData={() => setScrubLoaded(true)}
              onCanPlay={() => setScrubLoaded(true)}
              onWaiting={() => setScrubLoaded(false)}
              onSeeking={(event) => {
                const video = event.currentTarget;
                const buffered = Array.from(
                  { length: video.buffered.length },
                  (_, index) =>
                    video.currentTime >= video.buffered.start(index) &&
                    video.currentTime <= video.buffered.end(index),
                ).some(Boolean);
                if (!buffered) setScrubLoaded(false);
              }}
              onSeeked={() => setScrubLoaded(true)}
              onError={() => setScrubError(true)}
              aria-label="Scroll-controlled AI transition from an airplane window to a mountain landscape"
            />
          </div>
          <div className={styles.scrubShade} />
          <div className={styles.depthTunnel} aria-hidden="true">
            {Array.from({ length: 6 }, (_, layer) => (
              <i key={layer} style={{ "--layer": layer } as CSSProperties} />
            ))}
          </div>
          <div className={styles.scrubTop}>
            <span className={styles.glassLabel}>Inside an AI transition</span>
            <span>
              {motion
                ? "Your scroll moves the playhead"
                : "Explore at your own pace"}
            </span>
          </div>
          <div className={styles.scrubCopy}>
            <h2 id="scrub-title">
              Fly beyond
              <br />
              the window seat.
            </h2>
            <p>
              An airplane window. A whole new view.
              <br />
              AI makes the move between them.
            </p>
            <button
              className={styles.lightButton}
              onClick={() => openFilm("window-clouds")}
            >
              <Icon name="play" /> Watch the full example
            </button>
          </div>
          <div className={styles.scrubBottom}>
            <div className={styles.scrubRuler} aria-hidden="true">
              <i />
            </div>
            <div className={styles.scrubLabels}>
              <span>Original shot</span>
              <strong>AI-generated in-between</strong>
              <span>Next shot</span>
            </div>
            <div className={styles.scrubLinks}>
              <span>
                {scrubError
                  ? "Scroll preview unavailable. Use the full example above."
                  : loadScrub && !scrubLoaded
                    ? "Loading the requested frame…"
                    : "Example: Airplane window → Mountains"}
              </span>
              <a href="#how-it-works">
                How it works <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.process}
        id="how-it-works"
        data-scene="process"
      >
        <div className={styles.processHeading}>
          <span className={styles.sectionLabel}>
            A little input. A whole new connection.
          </span>
          <h2>
            Two clips in.
            <br />
            An impossible move out.
          </h2>
          <p>
            No timeline gymnastics. No frame-by-frame masking.
            <br />
            Just a beginning, an ending, and a little imagination.
          </p>
        </div>
        <div className={styles.processGrid}>
          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <div>
                <h3>Bring your two shots</h3>
                <p>
                  Upload two videos or images. Clipmelt finds the frames where
                  one shot ends and the next begins.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Find the connection</h3>
                <p>
                  Clipmelt reads your footage and suggests transitions that fit.
                  Choose your favorite direction.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Let AI fill the gap</h3>
                <p>
                  Generate, preview, and download the bridge or your combined
                  video. Your source files stay yours.
                </p>
              </div>
            </li>
          </ol>
          <div
            className={styles.processVisual}
            aria-label="Two original frames connected by a generated transition"
          >
            <div className={styles.processPlaneA}>
              <img
                src="/examples/window-clouds/frame_a.jpg"
                alt="View through an airplane window"
                loading="lazy"
                width="640"
                height="360"
              />
              <span>Your starting frame</span>
            </div>
            <div className={styles.processPlaneAi}>
              <span>✳</span>
              <strong>
                AI fills
                <br />
                the space.
              </strong>
              <small>A transition made for your shots</small>
            </div>
            <div className={styles.processPlaneB}>
              <img
                src="/examples/window-clouds/frame_b.jpg"
                alt="A mountain landscape above a layer of mist"
                loading="lazy"
                width="640"
                height="360"
              />
              <span>Your ending frame</span>
            </div>
          </div>
        </div>
        <div className={styles.processFooter}>
          <Link href="/create" className={styles.darkButton}>
            Make your first transition <Icon />
          </Link>
          <span>First preview free. Yours to try.</span>
        </div>
      </section>

      <section className={styles.gallery} id="examples" data-scene="gallery">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionLabel}>A few ways to get there</span>
            <h2>
              Different worlds.
              <br />
              One smooth move.
            </h2>
          </div>
          <Link href="/library" className={styles.textLink}>
            Explore transition styles <Icon />
          </Link>
        </div>
        <div className={styles.galleryGrid}>
          {FILMS.slice(1).map((item, index) => (
            <button
              key={item.id}
              className={styles.galleryCard}
              onClick={() => openFilm(item.id)}
              aria-label={`Watch ${item.title} before and after`}
            >
              <div className={styles.galleryImage}>
                <img
                  src={`/examples/${item.id}/frame_b.jpg`}
                  alt={`${item.end} destination frame`}
                  width="640"
                  height="360"
                  loading="lazy"
                />
                <span className={styles.galleryIndex}>{item.kind}</span>
                <span className={styles.galleryPlay}>
                  <Icon name="play" />
                </span>
                <div className={styles.galleryInset}>
                  <img
                    src={`/examples/${item.id}/frame_a.jpg`}
                    alt={`${item.start} starting frame`}
                    width="320"
                    height="180"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className={styles.galleryCaption}>
                <span>{item.title}</span>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
            </button>
          ))}
        </div>
        <p className={styles.galleryNote}>
          Example renders. The starting shot, the AI-generated bridge, and the
          destination—all in one place.
        </p>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title">
        <div>
          <span className={styles.sectionLabel}>
            Before your first transition
          </span>
          <h2 id="faq-title">
            Good questions.
            <br />
            Straight answers.
          </h2>
          <Link href="/pricing" className={styles.textLink}>
            See credit packs <Icon />
          </Link>
        </div>
        <div className={styles.faqList}>
          {FAQ.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Icon name="plus" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} data-scene="outro">
        <div className={styles.outroFrames} aria-hidden="true">
          <img src="/examples/coffee-ocean/frame_a.jpg" alt="" loading="lazy" />
          <img src="/examples/coffee-ocean/frame_b.jpg" alt="" loading="lazy" />
        </div>
        <span className={styles.sectionLabel}>
          Your footage has somewhere to go.
        </span>
        <h2>
          Make the
          <br />
          in-between yours.
        </h2>
        <Link href="/create" data-cta="footer" className={styles.primary}>
          Create a transition <Icon />
        </Link>
        <p>One free preview. No signup. Just bring two clips.</p>
      </section>
      {film && <FilmDialog id={film} onClose={() => setFilm(null)} />}
    </div>
  );
}

function FilmDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"before" | "after">("after");
  const [failed, setFailed] = useState(false);
  const selected = FILMS.find((item) => item.id === id)!;
  useEffect(() => {
    const node = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    node?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      node?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="film-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogTop}>
        <div>
          <span className={styles.sectionLabel}>See the difference</span>
          <h2 id="film-title">{selected.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close example">
          ×
        </button>
      </div>
      <video
        key={mode}
        src={`/examples/${id}/${mode}.mp4`}
        poster={`/examples/${id}/poster.jpg`}
        controls
        muted
        playsInline
        autoPlay
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert">
          The example couldn’t load. Check your connection and reopen it.
        </p>
      )}
      <div className={styles.dialogBottom}>
        <div
          className={styles.comparison}
          role="group"
          aria-label="Compare the original cut and AI transition"
        >
          <button
            aria-pressed={mode === "before"}
            onClick={() => {
              setMode("before");
              setFailed(false);
            }}
          >
            Original hard cut
          </button>
          <button
            aria-pressed={mode === "after"}
            onClick={() => {
              setMode("after");
              setFailed(false);
            }}
          >
            With AI transition
          </button>
        </div>
        <Link href="/create" className={styles.primary}>
          Try your clips <Icon />
        </Link>
      </div>
    </dialog>
  );
}
