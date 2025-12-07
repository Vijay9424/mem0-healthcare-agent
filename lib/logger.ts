// lib/logger.ts
import { mkdir, appendFile } from "fs/promises";
import path from "path";

export interface LogEntry {
  timestamp: string;
  model: string;
  finishReason?: string;
  role?: string;
  patientId?: string;
  conversationId?: string;
  lastUserText?: string;
  assistantText?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  costUSD?: {
    input: number;
    output: number;
    total: number;
  };
}

const LOG_DIR = process.env.AI_LOG_DIR ?? ".ai-logs";
const LOG_FILE = path.join(LOG_DIR, "chat.log");

// OpenAI pricing — update anytime without touching the rest of the app
export const AI_PRICING = {
  GPT4O: {
    inputPer1M: 5, // $5 per 1M input tokens
    outputPer1M: 15, // $15 per 1M output tokens
  },
};

async function ensureLogDir() {
  await mkdir(LOG_DIR, { recursive: true });
}

export async function writeLog(entry: LogEntry) {
  try {
    await ensureLogDir();
    const line = JSON.stringify(entry) + "\n";
    await appendFile(LOG_FILE, line, "utf8");
  } catch (err) {
    console.error("⚠️ Failed to write AI log:", err);
  }
}

export function calculateCost(
  model: keyof typeof AI_PRICING,
  inputTokens?: number,
  outputTokens?: number
) {
  const pricing = AI_PRICING[model];

  const inputCost =
    inputTokens != null ? (inputTokens / 1_000_000) * pricing.inputPer1M : 0;

  const outputCost =
    outputTokens != null ? (outputTokens / 1_000_000) * pricing.outputPer1M : 0;

  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
}
