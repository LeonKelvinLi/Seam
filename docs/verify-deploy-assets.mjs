import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/deploy-assets.json"), "utf8"));
const errors = [];
const seen = new Set();
for (const file of manifest.files) {
  if (!/^public\/(examples|samples|library)\//.test(file.path) || file.path.split("/").includes("..") || seen.has(file.path)) {
    errors.push(`Invalid or duplicated asset path: ${file.path}`);
    continue;
  }
  seen.add(file.path);
  const absolute = path.join(root, file.path);
  if (!fs.existsSync(absolute)) { errors.push(`Missing: ${file.path}`); continue; }
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== file.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    errors.push(`Changed since manifest approval: ${file.path}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (process.argv.includes("--paths")) {
  process.stdout.write(manifest.files.map((file) => file.path).join("\n") + "\n");
} else {
  const mib = manifest.files.reduce((sum, file) => sum + file.bytes, 0) / 1024 ** 2;
  console.log(`Verified ${manifest.files.length} deployment assets (${mib.toFixed(2)} MiB), ${manifest.version}.`);
}
