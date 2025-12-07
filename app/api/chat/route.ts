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
    .map((p) => (p as { type: "text"; text: string }).text)
    .join(" ")
    .trim();
}

// Helper: extract plain text from a UIMessage (for Mem0)
function uiMessageToText(m: UIMessage): string {
  return (
    m.parts
      ?.filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join(" ")
      .trim() ?? ""
  );
}

export async function POST(req: Request) {
  const start = Date.now();
  
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    return Response.json(
      { error: "Invalid request body: must be valid JSON" },
      { status: 400 }
    );
  }

  const { messages, chatId, role, patientId } = body;

  // Validate required fields
  if (!messages || !Array.isArray(messages)) {
    return Response.json(
      { error: "Missing or invalid 'messages' field (must be an array)" },
      { status: 400 }
    );
  }
  if (!chatId || typeof chatId !== "string") {
    return Response.json(
      { error: "Missing or invalid 'chatId' field (must be a string)" },
      { status: 400 }
    );
  }
  if (!role || typeof role !== "string" || !["doctor", "nurse", "receptionist"].includes(role)) {
    return Response.json(
      { error: "Missing or invalid 'role' field (must be doctor, nurse, or receptionist)" },
      { status: 400 }
    );
  }
  if (!patientId || typeof patientId !== "string") {
    return Response.json(
      { error: "Missing or invalid 'patientId' field (must be a string)" },
      { status: 400 }
    );
  }

  // Type guard: ensure role is one of the valid types
  const validRole = role as Role;

  // 🧠 1) Role-specific base system instruction
  const systemInstruction =
    role === "doctor"
      ? `You are an AI assistant for medical doctors.
Provide only what is asked.
Give factual, medically accurate, concise answers.
If asked for diagnosis, tests, medications, or reasoning — provide them clearly.
Do not add extra explanations, disclaimers, or suggestions unless explicitly requested.
If information is missing, state exactly what is needed.
Never include unnecessary text.`
      : role === "nurse"
      ? `You are an AI assistant for hospital nurses.
Answer only the exact question asked.
Provide concise, practical, clinical nursing information such as medication timing, monitoring steps, wound care, safety alerts, or shift tasks.
Do not add extra explanation or suggestions unless explicitly requested.
If information is incomplete, state what is missing.
No unnecessary details.`
      : `You are an AI assistant for hospital receptionists.
Answer only what is asked.
Provide short, accurate information about appointments, billing, insurance, scheduling, forms, or hospital processes.
Do not give any medical advice.
If the question is medical, redirect by saying: “Please ask a doctor or nurse.”
No extra details or suggestions.`;

  // 🧠 2) Extract last user message for memory search
  const lastUserText = getLastUserText(messages);

  // 🧠 3) MEMORY PIPELINE: SEARCH FIRST (don't make user wait for add)
  // According to Mem0 docs: search → stream response → add asynchronously
  let memoryContext = "";
  let memoryError: string | null = null;

  if (lastUserText) {
    // ✅ STEP 1: Search Neo4j for relevant patient history FIRST
    // This finds related entities and returns them as context
    // Example: Search "anger" → returns (patient-1) -[has_symptom]-> (anger_issues)
    try {
      console.log(`[Mem0] Searching graph for: "${lastUserText}"`);
      
      const searchResults = await memory.search(lastUserText, {
        userId: patientId, // Search only this patient's memories
        agentId: validRole, // Search only this role's memories
        limit: 8, // Return top 8 related facts
      });

      console.log(`[Mem0] Search returned ${searchResults?.results?.length ?? 0} results`);

      const memorySnippets =
        searchResults?.results
          ?.map((r) => (r as { memory?: string }).memory)
          .filter(Boolean)
          .map((m) => `- ${m}`)
          .join("\n") ?? "";

      if (memorySnippets) {
        memoryContext = `\n📋 Patient History (from Neo4j graph memory):\n${memorySnippets}\n`;
        console.log(`[Mem0] Injected ${searchResults?.results?.length} memory snippets into context`);
      } else {
        console.log(`[Mem0] No matching memories found for this patient`);
      }
    } catch (searchErr) {
      memoryError = `Failed to search Neo4j: ${searchErr instanceof Error ? searchErr.message : String(searchErr)}`;
      console.error(`[Mem0] ${memoryError}`);
      // Continue without context - search failure shouldn't block response
    }
  }

  // 🧠 4) Build final system prompt with Mem0 context
  // If memory failed, include error message so we know why context is missing
  const memoryNote = memoryError
    ? `⚠️ Memory System Error: ${memoryError}\nProceeding without historical context.`
    : memoryContext
    ? memoryContext
    : `📋 No previous patient history found in Neo4j graph memory.`;

  const systemPrompt = `${systemInstruction}

Current Patient ID (context only): ${patientId}
Agent role: ${role}

${memoryNote}

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
      const latencyMs = Date.now() - start;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;

      const cost = calculateCost("GPT4O", inputTokens, outputTokens);

      try {
        await writeLog({
          timestamp: new Date().toISOString(),
          model: "gpt-4o",
          latencyMs,
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
      } catch (err) {
        console.error("Failed to write log in onFinish:", err);
      }
    },
  });

  // 🧠 6) Stream response to user immediately, then add to memory asynchronously
  return result.toUIMessageStreamResponse({
    originalMessages: messages, // full history for UI + persistence
    async onFinish({ messages: updatedMessages }) {
      try {
        // Save chat history to SQLite
        saveChat({
          chatId,
          messages: updatedMessages,
          role,
          patientId,
        });
      } catch (err) {
        console.error("Failed to save chat in onFinish:", err);
      }

      // 🧠 STEP 2: Add conversation to Neo4j graph ASYNCHRONOUSLY (after response sent)
      // This extracts entities (symptoms, diagnoses, treatments) and stores relationships
      // User already got their response, so this doesn't block them
      // Example: "patient has anger issues" → (patient-1) -[has_symptom]-> (anger_issues)
      if (lastUserText) {
        try {
          const mem0Messages = updatedMessages
            .slice(-4)
            .map((m) => ({
              role: m.role, // "user" | "assistant"
              content: uiMessageToText(m),
            }));

          if (mem0Messages.length > 0) {
            console.log(`[Mem0] Adding ${mem0Messages.length} messages to graph for patient ${patientId} (async)`);
            
            await memory.add(mem0Messages, {
              userId: patientId, // Groups memories by patient
              agentId: validRole, // Groups memories by role (doctor, nurse, receptionist)
              runId: chatId, // Tracks which conversation this came from
            });

            console.log(`[Mem0] Successfully added messages to Neo4j graph (async)`);
          }
        } catch (addErr) {
          const addError = `Failed to add memory to Neo4j: ${addErr instanceof Error ? addErr.message : String(addErr)}`;
          console.error(`[Mem0] ${addError}`);
          // Log but don't crash - async memory add failure shouldn't affect user
        }
      }
    },
  });
}
