/**
 * Thin typed repository over SQLite. Rows use camelCase column names that match
 * the TypeScript entities in core/types.ts; JSON/boolean columns are hydrated here.
 */
import { db } from "./client";
import { newId, now } from "@/core/ids";
import type {
  Asset, AnalyticsEvent, CostEntry, ExtractedFrame, Generation, GenerationAttempt, Job, JobType,
  LearningRecord, PairAnalysisRecord, Project, Purchase, QualityEvaluation, Recommendation, Session, Share,
  TransitionOpportunity, User, VisualAnalysis, Export,
} from "@/core/types";

export type Table =
  | "users" | "sessions" | "purchases" | "projects" | "assets" | "frames" | "visualAnalyses" | "pairAnalyses" | "opportunities"
  | "recommendations" | "generations" | "attempts" | "qualityEvaluations" | "exports" | "shares"
  | "jobs" | "learningRecords" | "costs" | "events";

const JSON_COLS: Partial<Record<Table, string[]>> = {
  frames: ["features"],
  visualAnalyses: ["data"],
  pairAnalyses: ["data"],
  opportunities: ["scores", "hints"],
  generations: ["fineTune", "result"],
  attempts: ["promptIR", "compiledPrompt", "params"],
  qualityEvaluations: ["scores"],
  jobs: ["payload"],
  learningRecords: ["sourceTraits", "destinationTraits", "params"],
  events: ["props"],
};

const BOOL_COLS: Partial<Record<Table, string[]>> = {
  assets: ["hasAudio"],
  qualityEvaluations: ["passed"],
  learningRecords: ["userRegenerated", "userDownloaded", "userShared", "userMadeWilder", "userMadeSmoother"],
};

type Row = Record<string, unknown>;

function serialize(table: Table, row: Row): Row {
  const out: Row = {};
  const json = JSON_COLS[table] ?? [];
  const bools = BOOL_COLS[table] ?? [];
  for (const [k, v] of Object.entries(row)) {
    if (json.includes(k)) out[k] = v === null || v === undefined ? null : JSON.stringify(v);
    else if (bools.includes(k)) out[k] = v ? 1 : 0;
    else if (typeof v === "boolean") out[k] = v ? 1 : 0;
    else out[k] = v === undefined ? null : v;
  }
  return out;
}

function hydrate<T>(table: Table, row: Row | undefined): T | undefined {
  if (!row) return undefined;
  const json = JSON_COLS[table] ?? [];
  const bools = BOOL_COLS[table] ?? [];
  const out: Row = { ...row };
  for (const k of json) if (typeof out[k] === "string") out[k] = JSON.parse(out[k] as string);
  for (const k of bools) out[k] = Boolean(out[k]);
  return out as T;
}

export function insert<T extends { id: string }>(table: Table, row: T): T {
  const s = serialize(table, row as unknown as Row);
  const cols = Object.keys(s);
  db().prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`).run(s);
  return row;
}

export function update(table: Table, id: string, patch: Row): void {
  const s = serialize(table, patch);
  const cols = Object.keys(s);
  if (cols.length === 0) return;
  db().prepare(`UPDATE ${table} SET ${cols.map((c) => `${c}=@${c}`).join(",")} WHERE id=@__id`).run({ ...s, __id: id });
}

export function get<T>(table: Table, id: string): T | undefined {
  return hydrate<T>(table, db().prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as Row | undefined);
}

export function find<T>(table: Table, where: string, params: unknown[] = [], orderBy = "createdAt ASC", limit?: number): T[] {
  const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy}` + (limit ? ` LIMIT ${limit}` : "");
  return (db().prepare(sql).all(...params) as Row[]).map((r) => hydrate<T>(table, r)!) ;
}

export function remove(table: Table, where: string, params: unknown[] = []): void {
  db().prepare(`DELETE FROM ${table} WHERE ${where}`).run(...params);
}

/* ---------- Convenience accessors ---------- */

export const Users = {
  ensure(id: string): User {
    const u = get<User>("users", id);
    if (u) return u;
    return insert<User>("users", { id, createdAt: now(), email: null, passwordHash: null, credits: 5, plan: "free", stripeCustomerId: null, updatedAt: null });
  },
  get: (id: string) => get<User>("users", id),
  byEmail: (email: string) => find<User>("users", "email=?", [email.toLowerCase()], "createdAt ASC", 1)[0],
  createAccount(email: string, passwordHash: string): User {
    return insert<User>("users", { id: newId("usr"), createdAt: now(), email: email.toLowerCase(), passwordHash, credits: 5, plan: "free", stripeCustomerId: null, updatedAt: now() });
  },
  update(id: string, patch: Partial<User>) { update("users", id, { ...patch, updatedAt: now() }); },
  /** Atomically spend credits; returns false when the balance is too low. */
  spend(id: string, amount: number): boolean {
    const r = db().prepare("UPDATE users SET credits=credits-?, updatedAt=? WHERE id=? AND credits>=?").run(amount, now(), id, amount);
    return r.changes === 1;
  },
  grant(id: string, amount: number) { db().prepare("UPDATE users SET credits=credits+?, updatedAt=? WHERE id=?").run(amount, now(), id); },
  /** Move a guest's projects, generations and events onto an account. */
  adopt(guestId: string, userId: string) {
    if (guestId === userId) return;
    for (const t of ["projects", "events"]) db().prepare(`UPDATE ${t} SET userId=? WHERE userId=?`).run(userId, guestId);
  },
};

export const Sessions = {
  create(userId: string, days = 30): Session {
    const t = new Date();
    return insert<Session>("sessions", { id: newId("", 32), userId, createdAt: t.toISOString(), expiresAt: new Date(t.getTime() + days * 86400_000).toISOString() });
  },
  get(id: string): Session | undefined {
    const s = get<Session>("sessions", id);
    if (!s) return undefined;
    if (s.expiresAt < now()) { remove("sessions", "id=?", [id]); return undefined; }
    return s;
  },
  destroy: (id: string) => remove("sessions", "id=?", [id]),
};

export const Purchases = {
  record(p: Omit<Purchase, "id" | "createdAt">): Purchase | null {
    if (p.externalId && find<Purchase>("purchases", "externalId=?", [p.externalId]).length) return null; // idempotent
    return insert<Purchase>("purchases", { ...p, id: newId("pur"), createdAt: now() });
  },
  forUser: (userId: string) => find<Purchase>("purchases", "userId=?", [userId], "createdAt DESC"),
};

export const Projects = {
  create(userId: string, title = "Untitled"): Project {
    const t = now();
    return insert<Project>("projects", {
      id: newId("prj"), userId, title, status: "draft", outputWidth: null, outputHeight: null,
      analysisError: null, createdAt: t, updatedAt: t,
    });
  },
  get: (id: string) => get<Project>("projects", id),
  update(id: string, patch: Partial<Project>) { update("projects", id, { ...patch, updatedAt: now() }); },
  countForUser: (userId: string) => (db().prepare("SELECT COUNT(*) c FROM projects WHERE userId=?").get(userId) as { c: number }).c,
};

export const Assets = {
  create(a: Omit<Asset, "id" | "createdAt">): Asset {
    return insert<Asset>("assets", { ...a, id: newId("ast"), createdAt: now() });
  },
  get: (id: string) => get<Asset>("assets", id),
  update: (id: string, patch: Partial<Asset>) => update("assets", id, patch),
  forProject: (projectId: string) => find<Asset>("assets", "projectId=?", [projectId]),
  byRole(projectId: string, role: Asset["role"]) {
    return find<Asset>("assets", "projectId=? AND role=?", [projectId, role], "createdAt DESC", 1)[0];
  },
  removeForRole(projectId: string, role: Asset["role"]) {
    const old = find<Asset>("assets", "projectId=? AND role=?", [projectId, role]);
    for (const a of old) {
      remove("frames", "assetId=?", [a.id]);
      remove("visualAnalyses", "assetId=?", [a.id]);
    }
    remove("assets", "projectId=? AND role=?", [projectId, role]);
    return old;
  },
};

export const Frames = {
  create(f: Omit<ExtractedFrame, "id" | "createdAt">): ExtractedFrame {
    return insert<ExtractedFrame>("frames", { ...f, id: newId("frm"), createdAt: now() });
  },
  get: (id: string) => get<ExtractedFrame>("frames", id),
  forAsset: (assetId: string) => find<ExtractedFrame>("frames", "assetId=?", [assetId], "t ASC"),
  clearForAsset: (assetId: string) => remove("frames", "assetId=?", [assetId]),
  update: (id: string, patch: Partial<ExtractedFrame>) => update("frames", id, patch),
};

export const VisualAnalyses = {
  create(v: Omit<VisualAnalysis, "id" | "createdAt">): VisualAnalysis {
    return insert<VisualAnalysis>("visualAnalyses", { ...v, id: newId("va"), createdAt: now() });
  },
  forAsset: (assetId: string) => find<VisualAnalysis>("visualAnalyses", "assetId=?", [assetId]),
  forFrame: (frameId: string) => find<VisualAnalysis>("visualAnalyses", "frameId=?", [frameId], "createdAt DESC", 1)[0],
  clearForAsset: (assetId: string) => remove("visualAnalyses", "assetId=?", [assetId]),
};

export const PairAnalyses = {
  create(p: Omit<PairAnalysisRecord, "id" | "createdAt">): PairAnalysisRecord {
    return insert<PairAnalysisRecord>("pairAnalyses", { ...p, id: newId("pair"), createdAt: now() });
  },
  get: (id: string) => get<PairAnalysisRecord>("pairAnalyses", id),
  latestForProject: (projectId: string) =>
    find<PairAnalysisRecord>("pairAnalyses", "projectId=?", [projectId], "createdAt DESC", 1)[0],
};

export const Opportunities = {
  replaceForProject(projectId: string, list: Omit<TransitionOpportunity, "id" | "createdAt">[]): TransitionOpportunity[] {
    remove("opportunities", "projectId=?", [projectId]);
    remove("recommendations", "projectId=?", [projectId]);
    const t = now();
    return list.map((o) => insert<TransitionOpportunity>("opportunities", { ...o, id: newId("opp"), createdAt: t }));
  },
  get: (id: string) => get<TransitionOpportunity>("opportunities", id),
  forProject: (projectId: string) => find<TransitionOpportunity>("opportunities", "projectId=?", [projectId], "rank ASC"),
};

export const Recommendations = {
  replaceForProject(projectId: string, list: { lane: Recommendation["lane"]; opportunityId: string }[]): Recommendation[] {
    remove("recommendations", "projectId=?", [projectId]);
    const t = now();
    return list.map((r) => insert<Recommendation>("recommendations", { ...r, id: newId("rec"), projectId, createdAt: t }));
  },
  forProject: (projectId: string) => find<Recommendation>("recommendations", "projectId=?", [projectId]),
};

export const Generations = {
  create(g: Omit<Generation, "id" | "createdAt" | "updatedAt">): Generation {
    const t = now();
    return insert<Generation>("generations", { ...g, id: newId("gen"), createdAt: t, updatedAt: t });
  },
  get: (id: string) => get<Generation>("generations", id),
  update(id: string, patch: Partial<Generation>) { update("generations", id, { ...patch, updatedAt: now() }); },
  forProject: (projectId: string) => find<Generation>("generations", "projectId=?", [projectId], "createdAt DESC"),
};

export const Attempts = {
  create(a: Omit<GenerationAttempt, "id" | "createdAt">): GenerationAttempt {
    return insert<GenerationAttempt>("attempts", { ...a, id: newId("att"), createdAt: now() });
  },
  update: (id: string, patch: Partial<GenerationAttempt>) => update("attempts", id, patch),
  forGeneration: (generationId: string) => find<GenerationAttempt>("attempts", "generationId=?", [generationId], "n ASC"),
};

export const Quality = {
  create(q: Omit<QualityEvaluation, "id" | "createdAt">): QualityEvaluation {
    return insert<QualityEvaluation>("qualityEvaluations", { ...q, id: newId("q"), createdAt: now() });
  },
  forAttempt: (attemptId: string) => find<QualityEvaluation>("qualityEvaluations", "attemptId=?", [attemptId]),
};

export const Exports = {
  create(e: Omit<Export, "id" | "createdAt">): Export {
    return insert<Export>("exports", { ...e, id: newId("exp"), createdAt: now() });
  },
};

export const Shares = {
  create(generationId: string): Share {
    const existing = find<Share>("shares", "generationId=?", [generationId], "createdAt DESC", 1)[0];
    if (existing) return existing;
    return insert<Share>("shares", { id: newId("", 8), generationId, views: 0, createdAt: now() });
  },
  get: (id: string) => get<Share>("shares", id),
  bump(id: string) { db().prepare("UPDATE shares SET views=views+1 WHERE id=?").run(id); },
};

export const Jobs = {
  create(type: JobType, payload: Record<string, unknown>, stageLabel = "Queued"): Job {
    const t = now();
    return insert<Job>("jobs", {
      id: newId("job"), type, payload, status: "queued", stage: "queued", stageLabel, progress: 0,
      error: null, attempts: 0, createdAt: t, updatedAt: t, startedAt: null, finishedAt: null,
    });
  },
  get: (id: string) => get<Job>("jobs", id),
  update(id: string, patch: Partial<Job>) { update("jobs", id, { ...patch, updatedAt: now() }); },
  /** Atomically claim the oldest queued job. */
  claimNext(): Job | undefined {
    const t = now();
    const row = db()
      .prepare(
        `UPDATE jobs SET status='running', startedAt=?, updatedAt=?, attempts=attempts+1
         WHERE id = (SELECT id FROM jobs WHERE status='queued' ORDER BY createdAt LIMIT 1) RETURNING *`,
      )
      .get(t, t) as Record<string, unknown> | undefined;
    return row ? (hydrate<Job>("jobs", row) as Job) : undefined;
  },
  queuedCount: () => (db().prepare("SELECT COUNT(*) c FROM jobs WHERE status='queued'").get() as { c: number }).c,
  /** After a crash or deploy, jobs left 'running' belong to a dead process: put them back in the queue. */
  requeueStale(): number {
    return db().prepare("UPDATE jobs SET status='queued', stage='queued', stageLabel='Queued', progress=0, updatedAt=? WHERE status='running'").run(now()).changes;
  },
};

export const Learning = {
  upsert(r: Omit<LearningRecord, "id" | "createdAt" | "updatedAt">): LearningRecord {
    const existing = find<LearningRecord>("learningRecords", "generationId=?", [r.generationId])[0];
    const t = now();
    if (existing) {
      update("learningRecords", existing.id, { ...r, updatedAt: t });
      return { ...existing, ...r, updatedAt: t };
    }
    return insert<LearningRecord>("learningRecords", { ...r, id: newId("lrn"), createdAt: t, updatedAt: t });
  },
  flag(generationId: string, flag: keyof Pick<LearningRecord, "userRegenerated" | "userDownloaded" | "userShared" | "userMadeWilder" | "userMadeSmoother">) {
    db().prepare(`UPDATE learningRecords SET ${flag}=1, updatedAt=? WHERE generationId=?`).run(now(), generationId);
  },
  all: () => find<LearningRecord>("learningRecords", "1=1"),
};

export const Costs = {
  add(c: Omit<CostEntry, "id" | "createdAt">): CostEntry {
    return insert<CostEntry>("costs", { ...c, id: newId("cost"), createdAt: now() });
  },
};

export const Events = {
  track(name: string, ctx: { userId?: string | null; projectId?: string | null; generationId?: string | null; props?: Record<string, unknown> } = {}): AnalyticsEvent {
    return insert<AnalyticsEvent>("events", {
      id: newId("evt"), name, userId: ctx.userId ?? null, projectId: ctx.projectId ?? null,
      generationId: ctx.generationId ?? null, props: ctx.props ?? {}, createdAt: now(),
    });
  },
};
