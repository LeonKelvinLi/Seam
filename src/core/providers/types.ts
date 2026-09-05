import type { FrameSpec } from "@/core/media/ffmpeg";
import type { ModelClass, TransitionRecipe } from "@/core/recipes/types";
import type { PromptDialect } from "@/core/prompt/compiler";
import type { GenerationMode } from "@/core/types";

export type ProviderId = "local" | "fal" | "runway";

export interface ModelSpec {
  /** Globally unique, e.g. "fal:kling-2.1-pro". */
  id: string;
  providerId: ProviderId;
  /** Provider-specific endpoint / model name. */
  endpoint: string;
  label: string;
  supportsLastFrame: boolean;
  /** Durations (seconds) the model can emit; the bridge is time-remapped afterwards. */
  durations: number[];
  costPerSecondUsd: number;
  tier: GenerationMode | "both";
  /** How well this model handles each transition class (0..1). Seeded by hand, refined by the learning system. */
  strengths: Record<ModelClass, number>;
  dialect: PromptDialect;
  latencyEstimateSec: number;
}

export interface TransitionRequest {
  firstFramePath: string;
  lastFramePath: string;
  prompt: { positive: string; negative: string | null };
  /** Desired bridge length after time-remapping. */
  durationSec: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  outputPath: string;
  transitionType: string;
  motionStrength: number;
  local: {
    spec: FrameSpec;
    recipe: TransitionRecipe;
    focusA: { x: number; y: number };
    focusB: { x: number; y: number };
  };
  onProgress?: (message: string) => void;
}

export interface TransitionResult {
  outputPath: string;
  providerJobId: string | null;
  rawDurationSec: number;
  costUsd: number;
  params: Record<string, unknown>;
}

export interface TransitionProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly models: ModelSpec[];
  isAvailable(): boolean;
  generateTransition(req: TransitionRequest, model: ModelSpec): Promise<TransitionResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly providerId: ProviderId) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function pollUntil<T>(fn: () => Promise<T | null>, intervalMs: number, timeoutMs: number, label: string): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fn();
    if (r !== null) return r;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new ProviderError(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`, true, "local");
}
