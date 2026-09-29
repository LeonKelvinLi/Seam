"""
Measure how Higgsfield transitions move, from renders already in the account (no credits spent).
For each render: does it start/end on the exact input frames (PSNR), how long it holds before moving and after
settling, when the scene switches (the frame where it stops looking like the start and starts looking like the end),
how fast it moves there, and the worst single-frame jump (1 = no frame jumps; our stitched joins measured 3-7).
  python3 scripts/hf-study.py <dir with index.json from the history download> [more videos...]
"""
import json, os, subprocess, sys
import numpy as np

W, H, FPS = 64, 112, 24
ENV = dict(os.environ, DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/Cellar/x265/4.2/lib")


def frames(src, still=False):
    vf = f"scale={W}:{H},format=gray" if still else f"fps={FPS},scale={W}:{H},format=gray"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", vf, "-f", "rawvideo", "-"], capture_output=True, env=ENV, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def psnr(a, b):
    mse = float(np.mean((a - b) ** 2))
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def study(video, start=None, end=None):
    f = frames(video)
    motion = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    med = float(np.median(motion))
    moving = np.where(motion > max(2.0, med * 1.5))[0]
    spike = max((motion[i] / max(0.6, (motion[i - 2] + motion[i - 1] + motion[i + 1] + motion[i + 2]) / 4) for i in range(2, len(motion) - 2)), default=0)
    out = {"sec": round(len(f) / FPS, 2), "holdIn": round(moving[0] / FPS, 2) if len(moving) else None,
           "settle": round((len(motion) - 1 - moving[-1]) / FPS, 2) if len(moving) else None,
           "peak": round(float(motion.max()), 1), "peakAt": round(int(motion.argmax()) / FPS, 2), "spike": round(float(spike), 2)}
    if start and end:
        s, e = frames(start, True)[0], frames(end, True)[0]
        out["startPSNR"], out["endPSNR"] = round(psnr(f[0], s), 1), round(psnr(f[-1], e), 1)
        toS = np.array([psnr(x, s) for x in f]); toE = np.array([psnr(x, e) for x in f])
        switch = int(np.argmax(toE > toS)) if (toE > toS).any() else None
        out["switchAt"] = round(switch / FPS, 2) if switch is not None else None
        out["motionAtSwitch"] = round(float(motion[min(switch, len(motion) - 1)]), 1) if switch is not None else None
    return out


if __name__ == "__main__":
    d = sys.argv[1]
    rows = json.load(open(os.path.join(d, "index.json")))
    res = []
    for r in rows:
        sid = r["id"][:8]
        vid = os.path.join(d, f"{sid}_result.mp4")
        st = next((os.path.join(d, x) for x in os.listdir(d) if x.startswith(f"{sid}_start")), None)
        en = next((os.path.join(d, x) for x in os.listdir(d) if x.startswith(f"{sid}_end")), None)
        m = study(vid, st, en)
        res.append({"id": sid, "motion": r["motion"], **m})
        print(sid, (r["motion"] or "")[:22].ljust(22), " ".join(f"{k}={v}" for k, v in m.items()))
    for extra in sys.argv[2:]:
        print(os.path.basename(extra)[:31].ljust(31), " ".join(f"{k}={v}" for k, v in study(extra).items()))
    json.dump(res, open(os.path.join(d, "study.json"), "w"), indent=1)
