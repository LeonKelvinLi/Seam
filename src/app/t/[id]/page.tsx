import Link from "next/link";
import { notFound } from "next/navigation";
import { sharePayload } from "@/lib/server/share";
import { ShareBeacon } from "@/components/ShareBeacon";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = sharePayload(id, true);
  if (!data) notFound();
  const g = data.generation;
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-10">
      <ShareBeacon id={id} />
      <div className="frame grain aspect-video bg-black">
        <video src={g.result?.fullUrl ?? undefined} poster={g.result?.posterUrl ?? undefined} controls autoPlay muted playsInline loop className="h-full w-full object-contain" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div><span className="text-lg">{g.title}</span> <span className="muted">· {g.recipe.name}</span></div>
        <span className="muted text-xs">{data.views} views</span>
      </div>
      <div className="mt-10 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Thumb src={data.start?.thumbnailUrl} label="Clip A" />
        <Arrow />
        <div className="frame grain aspect-video"><video src={g.result?.bridgeUrl ?? undefined} muted loop autoPlay playsInline className="h-full w-full object-cover" /><Label>Transition</Label></div>
        <Arrow />
        <Thumb src={data.end?.thumbnailUrl} label="Clip B" />
      </div>
      <div className="mt-12 flex flex-col items-start gap-3">
        <h2 className="display text-3xl">Make one with your clips.</h2>
        <p className="muted">Upload two clips. SeamCut figures out the transition.</p>
        <Link href="/create" className="btn btn-primary">Try SeamCut</Link>
      </div>
    </div>
  );
}

function Thumb({ src, label }: { src: string | null | undefined; label: string }) {
  return <div className="frame grain aspect-video">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}<Label>{label}</Label></div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-3 top-3 mono uppercase" style={{ color: "rgba(255,255,255,0.7)" }}>{children}</div>;
}
function Arrow() { return <div className="hidden justify-center md:flex muted">→</div>; }
