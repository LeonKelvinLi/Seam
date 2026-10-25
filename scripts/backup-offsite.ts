import "./_env";
const { backupOffsite, s3Store, verifyOffsiteSnapshot } = await import("../src/lib/server/offsite-backup");
const [command, key, destination] = process.argv.slice(2);
const usage = "Usage: node --import tsx scripts/backup-offsite.ts upload | verify <manifest-key> <new-isolated-directory>";
if (command === "--help" || command === "-h") {
  console.log(usage);
} else if (command === "upload") {
  const result = await backupOffsite();
  if (!result) throw new Error("Off-site backup is not configured");
  console.log(JSON.stringify({ uploaded: result }));
} else if (command === "verify" && key && destination) {
  console.log(JSON.stringify(await verifyOffsiteSnapshot(s3Store(), key, destination)));
} else {
  console.error(usage);
  process.exitCode = 1;
}
