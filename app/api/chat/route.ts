// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { writeLog, calculateCost } from "@/lib/logger";
import { saveChat } from "@/lib/chat-storage";
import { memory } from "@/lib/mem0"; // ✅ NEW: Mem0 with Neo4j graph

export const maxDuration = 30;

type Role = "doctor" | "nurse" | "receptionist";

function getLastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return undefined;
  return lastUser.parts
    .filter((p) => p.type === "text")
    .map((p: any) => p.text)
    .join(" ")
    .trim();
}

// Helper: extract plain text from a UIMessage (for Mem0)
function uiMessageToText(m: UIMessage): string {
  return (
    m.parts
      ?.filter((p) => p.type === "text")
      .map((p: any) => p.text)
      .join(" ")
      .trim() ?? ""
  );
}

export async function POST(req: Request) {
  const {
    messages,
    chatId,
    role,
    patientId,
  }: {
    messages: UIMessage[];
    chatId: string;
    role: Role;
    patientId: string;
  } = await req.json();

  // 🧠 1) Role-specific base system instruction
  const systemInstruction =
    role === "doctor"
      ? `You are an AI assistant that helps medical doctors make professional decisions.
Provide diagnostic insights, differential diagnosis, medication suggestions (with dosage ranges), test recommendations, and red-flag alerts.
Always be factual, concise, and medically accurate.`
      : role === "nurse"
      ? `You are an AI assistant that helps hospital nurses.
Assist in patient monitoring, medication schedules, wound care instructions, discharge planning, and alert nurses to safety concerns.
Provide actionable and clear nursing-oriented guidance.`
      : `You are an AI assistant that helps hospital receptionists.
Assist with scheduling, billing coordination, insurance queries, patient registration, and hospital process guidance.
Never provide medical advice. Always redirect medical questions to a doctor or nurse.`;

  // 🧠 2) Build Mem0 conversation payload (last few turns only)
  const lastUserText = getLastUserText(messages);
  const mem0Messages = messages.slice(-4).map((m) => ({
    role: m.role, // "user" | "assistant"
    content: uiMessageToText(m),
  }));

  // 🧠 3) Write to Mem0 + search relevant memories (with graph enabled globally)
  let memoryContext = "";
  try {
    if (mem0Messages.length > 0 && lastUserText) {
      // 3a. Add this small window of conversation to Mem0
      // Using userId = patientId, agentId = role, runId = chatId
      // (official graph docs recommend userId/agentId/runId for multi-agent graphs) :contentReference[oaicite:3]{index=3}
      await memory.add(mem0Messages, {
        userId: patientId,
        agentId: role,
        runId: chatId,
      });

      // 3b. Search Mem0 for relevant memories for this user + agent
      const searchResults = await memory.search(lastUserText, {
        userId: patientId,
        agentId: role,
        limit: 8,
        // Graph is already enabled via config.enableGraph
      });

      const memorySnippets =
        searchResults?.results
          ?.map((r: any) => r.memory)
          .filter(Boolean)
          .map((m: string) => `- ${m}`)
          .join("\n") ?? "";

      if (memorySnippets) {
        memoryContext = `\nHere are relevant past facts about this patient (from long-term Mem0 graph memory):\n${memorySnippets}\n`;
      }
    }
  } catch (err) {
    // If Mem0 or Neo4j fail, we just log and fall back to no extra memory
    console.error("Mem0 error (add/search) – falling back to no memory context:", err);
  }

  // 🧠 4) Build final system prompt with Mem0 context
  const systemPrompt = `${systemInstruction}

Current Patient ID (context only): ${patientId}
Agent role: ${role}
${memoryContext}
Important:
- Use the memories above as historical context for this patient.
- Do NOT hallucinate facts that are not supported by the memories or the current message.
- If something is unclear or missing, explicitly say what additional information you would need.`;

  // 🧠 5) Only send a SHORT recent window of turns to the model, not the whole history
  const recentMessages =
    messages.length <= 2 ? messages : messages.slice(-2);

  const result = await streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: convertToModelMessages(recentMessages),
    temperature: 0.4, // accuracy over creativity
    async onFinish({ usage, text, finishReason }) {
      const inputTokens =
        usage?.inputTokens ?? usage?.promptTokens;
      const outputTokens =
        usage?.outputTokens ?? usage?.completionTokens;

      const cost = calculateCost("GPT4O", inputTokens, outputTokens);

      await writeLog({
        timestamp: new Date().toISOString(),
        model: "gpt-4o",
        finishReason,
        role,
        patientId,
        conversationId: chatId,
        lastUserText,
        assistantText: text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: usage?.totalTokens,
          reasoningTokens: usage?.reasoningTokens,
          cachedInputTokens: usage?.cachedInputTokens,
        },
        costUSD: cost,
      });
    },
  });

  // 🧠 6) Still store the FULL UI history in SQLite for the UI (unchanged)
  return result.toUIMessageStreamResponse({
    originalMessages: messages, // full history for UI + persistence
    async onFinish({ messages: updatedMessages }) {
      await saveChat({
        chatId,
        messages: updatedMessages,
        role,
        patientId,
      });
    },
  });
}
