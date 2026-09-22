/**
 * Minimal Chrome DevTools Protocol client (Node 22+ has a global WebSocket, so no dependencies).
 * Launches the locally installed Chrome headless on an isolated throwaway profile, never the user's own.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch({ width = 1080, height = 1920, scale = 1 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "seamcut-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu-sandbox", "--hide-scrollbars", "--mute-audio",
    "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", "--force-color-profile=srgb",
    `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data ?? ""}`)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const once = (method) => new Promise((resolve) => {
    const fn = (p) => { listeners.get(method).delete(fn); resolve(p); };
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

  const api = {
    send,
    async goto(url, waitMs = 0) {
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url });
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async viewport(w, h, s = 1) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: s, mobile: false }); },
    async screenshot(file, { format = "png", quality = 92, fullPage = false } = {}) {
      const params = { format, captureBeyondViewport: fullPage };
      if (format === "jpeg") params.quality = quality;
      const { data } = await send("Page.captureScreenshot", params);
      const buf = Buffer.from(data, "base64");
      if (file) fs.writeFileSync(file, buf);
      return buf;
    },
    async setFiles(selector, index, files) {
      const { root } = await send("DOM.getDocument", { depth: -1 });
      const { nodeIds } = await send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
      if (!nodeIds[index]) throw new Error(`no element ${selector}[${index}]`);
      await send("DOM.setFileInputFiles", { nodeId: nodeIds[index], files });
    },
    async close() {
      try { ws.close(); } catch { /* closed */ }
      await new Promise((r) => { proc.once("exit", r); proc.kill(); setTimeout(r, 3000); });
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file briefly */ }
    },
  };
  return api;
}
