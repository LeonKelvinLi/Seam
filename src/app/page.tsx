import Link from "next/link";
import { HomeDemo } from "@/components/HomeDemo";
import { LandingBeacon } from "@/components/LandingBeacon";
import { DEMO_EXAMPLES } from "@/components/DemoScenes";
import { ExampleCard } from "@/components/ExampleCard";

export default function Home() {
  return (
    <div className="pb-16">
      <LandingBeacon />
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-10 md:pt-24">
        <h1 className="display text-5xl md:text-7xl max-w-4xl">Turn any two clips into one impossible shot.</h1>
        <p className="mt-5 text-lg muted max-w-xl">Upload two clips. AI figures out the transition.</p>
        <div className="mt-8 flex gap-3">
          <Link href="/create" className="btn btn-primary">Try it</Link>
          <a href="#examples" className="btn btn-ghost">Watch examples</a>
        </div>
      </section>

      <HomeDemo />

      <section id="examples" className="mx-auto max-w-6xl px-5 pt-24">
        <div className="flex items-end justify-between">
          <h2 className="display text-3xl">Examples</h2>
          <span className="muted text-sm">Before: a hard cut. After: Seam.</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_EXAMPLES.map((e) => <ExampleCard key={e.id} example={e} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-24">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            ["Understanding your clips", "Subjects, shapes, motion, depth and colour on both sides of the cut."],
            ["Designing the transition", "Four recommendations that fit your footage. Or let it surprise you."],
            ["Making the cut seamless", "The bridge is generated, checked, retried if needed, and stitched in."],
          ].map(([t, d], i) => (
            <div key={t} className="hair-t pt-5">
              <div className="mono muted">0{i + 1}</div>
              <div className="mt-2 text-lg">{t}</div>
              <div className="mt-1 muted">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-14"><Link href="/create" className="btn btn-primary">Make one with your clips</Link></div>
      </section>
    </div>
  );
}
