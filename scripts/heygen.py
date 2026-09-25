#!/usr/bin/env python3
"""
HeyGen v3 client for ad production: render one avatar clip, poll until done, download it, and report what it cost.

  python3 scripts/heygen.py --avatar <look_id> --out data/ads/heygen/line1.mp4 --script "Okay, ..." \
      [--voice <voice_id>] [--engine avatar_v] [--motion "excited, leaning in"] [--aspect 9:16]

Reads HEYGEN_API_KEY from .env.local (never printed). The wallet balance is read before and after, so each run
reports its own price; HeyGen does not publish self-serve API prices outside the dashboard.
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(re.findall(r"^([A-Z0-9_]+)=(.*)$", open(os.path.join(ROOT, ".env.local")).read(), re.M))
KEY = ENV.get("HEYGEN_API_KEY", "").strip().strip('"')
API = "https://api.heygen.com"


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Api-Key": KEY, "content-type": "application/json", "accept": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        sys.exit(f"HeyGen {method} {path} -> {e.code}: {e.read()[:500].decode()}")


def balance():
    w = call("GET", "/v3/users/me").get("data", {}).get("wallet") or {}
    return w.get("remaining_balance")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--avatar", required=True); a.add_argument("--script", required=True); a.add_argument("--out", required=True)
    a.add_argument("--voice"); a.add_argument("--engine", default="avatar_v"); a.add_argument("--motion"); a.add_argument("--aspect", default="9:16")
    a.add_argument("--resolution", default="1080p"); a.add_argument("--title", default="Clipmelt ad")
    o = a.parse_args()
    if not KEY: sys.exit("HEYGEN_API_KEY missing from .env.local")
    voice = o.voice
    if not voice:
        look = call("GET", f"/v3/avatars/looks/{o.avatar}").get("data", {})
        voice = look.get("default_voice_id")
    body = {"type": "avatar", "avatar_id": o.avatar, "script": o.script, "voice_id": voice, "title": o.title,
            "aspect_ratio": o.aspect, "resolution": o.resolution, "engine": {"type": o.engine}}
    if o.motion: body["motion_prompt"] = o.motion
    before = balance()
    vid = call("POST", "/v3/videos", body).get("data", {}).get("video_id")
    print(f"video {vid} queued ({o.engine}); balance before ${before}", flush=True)
    t0 = time.time()
    while True:
        d = call("GET", f"/v3/videos/{vid}").get("data", {})
        st = d.get("status")
        if st in ("completed", "failed"): break
        if time.time() - t0 > 1800: sys.exit("timed out after 30 min")
        time.sleep(10)
    if st == "failed": sys.exit(f"failed: {json.dumps(d.get('error') or d)[:500]}")
    url = d.get("video_url") or d.get("url")
    os.makedirs(os.path.dirname(os.path.abspath(o.out)), exist_ok=True)
    urllib.request.urlretrieve(url, o.out)
    after = balance()
    spent = round(before - after, 4) if isinstance(before, (int, float)) and isinstance(after, (int, float)) else None
    print(f"done in {time.time() - t0:.0f}s -> {o.out}; duration {d.get('duration')}s; spent ${spent}; balance ${after}")


if __name__ == "__main__":
    main()
