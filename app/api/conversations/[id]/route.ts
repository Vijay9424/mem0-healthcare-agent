// app/api/conversations/[id]/route.ts
import { loadChat } from "@/lib/chat-storage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const messages = loadChat(id);
  return Response.json(messages);
}

