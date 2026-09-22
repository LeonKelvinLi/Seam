import Database from "better-sqlite3";
import fs from "node:fs";
import { config } from "@/core/config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, email TEXT UNIQUE, passwordHash TEXT, credits INTEGER NOT NULL DEFAULT 6,
  plan TEXT NOT NULL DEFAULT 'free', stripeCustomerId TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(userId);
CREATE TABLE IF NOT EXISTS authTokens (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, kind TEXT NOT NULL, tokenHash TEXT NOT NULL,
  expiresAt TEXT NOT NULL, usedAt TEXT, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS authTokens_user ON authTokens(userId, kind);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, provider TEXT NOT NULL, externalId TEXT UNIQUE, pack TEXT NOT NULL,
  amountCents INTEGER NOT NULL, currency TEXT NOT NULL, credits INTEGER NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stripePayments (
  paymentIntentId TEXT PRIMARY KEY, sessionId TEXT NOT NULL UNIQUE,
  revokedCredits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stripeRefundTotals (
  chargeId TEXT PRIMARY KEY, paymentIntentId TEXT NOT NULL,
  amountRefunded INTEGER NOT NULL, currency TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stripeRefundTotals_payment ON stripeRefundTotals(paymentIntentId);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
  outputWidth INTEGER, outputHeight INTEGER, analysisError TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL,
  originalName TEXT NOT NULL, mime TEXT NOT NULL, path TEXT NOT NULL, sizeBytes INTEGER NOT NULL,
  durationSec REAL, width INTEGER, height INTEGER, fps REAL, hasAudio INTEGER NOT NULL DEFAULT 0,
  thumbnailPath TEXT, proxyPath TEXT, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_project ON assets(projectId);
CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY, assetId TEXT NOT NULL, t REAL NOT NULL, path TEXT NOT NULL,
  features TEXT NOT NULL, boundaryScore REAL NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS frames_asset ON frames(assetId);
CREATE TABLE IF NOT EXISTS visualAnalyses (
  id TEXT PRIMARY KEY, assetId TEXT NOT NULL, frameId TEXT NOT NULL, analyzer TEXT NOT NULL,
  data TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visualAnalyses_asset ON visualAnalyses(assetId);
CREATE TABLE IF NOT EXISTS pairAnalyses (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, startFrameId TEXT NOT NULL, endFrameId TEXT NOT NULL,
  analyzer TEXT NOT NULL, data TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pairAnalyses_project ON pairAnalyses(projectId);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, pairAnalysisId TEXT NOT NULL, recipeId TEXT NOT NULL,
  title TEXT NOT NULL, why TEXT NOT NULL, scores TEXT NOT NULL, hints TEXT NOT NULL, rank INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS opportunities_project ON opportunities(projectId);
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, lane TEXT NOT NULL, opportunityId TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recommendations_project ON recommendations(projectId);
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, opportunityId TEXT NOT NULL, recipeId TEXT NOT NULL,
  intent TEXT NOT NULL, fineTune TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
  stage TEXT NOT NULL, stageLabel TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
  friendlyError TEXT, result TEXT, jobId TEXT, parentGenerationId TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS generations_project ON generations(projectId);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, generationId TEXT NOT NULL, n INTEGER NOT NULL, recipeId TEXT NOT NULL,
  providerId TEXT NOT NULL, modelId TEXT NOT NULL, promptIR TEXT NOT NULL, compiledPrompt TEXT NOT NULL,
  params TEXT NOT NULL, status TEXT NOT NULL, providerJobId TEXT, outputPath TEXT, error TEXT,
  costUsd REAL NOT NULL DEFAULT 0, durationMs INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_generation ON attempts(generationId);
CREATE TABLE IF NOT EXISTS qualityEvaluations (
  id TEXT PRIMARY KEY, attemptId TEXT NOT NULL, judge TEXT NOT NULL, scores TEXT NOT NULL,
  passed INTEGER NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY, generationId TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, generationId TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
  stage TEXT NOT NULL, stageLabel TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  startedAt TEXT, finishedAt TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, createdAt);
CREATE TABLE IF NOT EXISTS learningRecords (
  id TEXT PRIMARY KEY, generationId TEXT NOT NULL UNIQUE, sourceTraits TEXT NOT NULL, destinationTraits TEXT NOT NULL,
  recipeId TEXT NOT NULL, intent TEXT NOT NULL, providerId TEXT NOT NULL, modelId TEXT NOT NULL,
  promptVersion TEXT NOT NULL, params TEXT NOT NULL, generationMs INTEGER NOT NULL, qualityOverall REAL,
  retryCount INTEGER NOT NULL, recommendedLane TEXT, userRegenerated INTEGER NOT NULL DEFAULT 0,
  userDownloaded INTEGER NOT NULL DEFAULT 0, userShared INTEGER NOT NULL DEFAULT 0,
  userMadeWilder INTEGER NOT NULL DEFAULT 0, userMadeSmoother INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS costs (
  id TEXT PRIMARY KEY, attemptId TEXT, generationId TEXT, kind TEXT NOT NULL, providerId TEXT NOT NULL,
  modelId TEXT NOT NULL, units REAL NOT NULL, usd REAL NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, userId TEXT, projectId TEXT, generationId TEXT, name TEXT NOT NULL,
  props TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_name ON events(name, createdAt);
`;

declare global {
  // eslint-disable-next-line no-var
  var __seamDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (globalThis.__seamDb) return globalThis.__seamDb;
  for (const d of [config.dataDir, config.uploadsDir, config.framesDir, config.rendersDir, config.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  const instance = new Database(config.dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("synchronous = NORMAL");
  instance.pragma("busy_timeout = 5000");
  instance.exec(SCHEMA);
  // Additive migrations for databases created before accounts existed.
  const cols = new Set((instance.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
  const add = (col: string, ddl: string) => { if (!cols.has(col)) instance.exec(`ALTER TABLE users ADD COLUMN ${col} ${ddl}`); };
  add("email", "TEXT"); add("passwordHash", "TEXT"); add("credits", "INTEGER NOT NULL DEFAULT 6"); add("plan", "TEXT NOT NULL DEFAULT 'free'");
  add("stripeCustomerId", "TEXT"); add("updatedAt", "TEXT"); add("emailVerifiedAt", "TEXT"); add("googleSub", "TEXT");
  instance.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)");
  instance.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(googleSub)");
  // Recover jobs left "running" by a previous process (dev restarts, crashes).
  instance.prepare("UPDATE jobs SET status='queued', updatedAt=? WHERE status='running'").run(new Date().toISOString());
  globalThis.__seamDb = instance;
  return instance;
}
