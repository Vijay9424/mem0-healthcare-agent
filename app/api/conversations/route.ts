// app/api/conversations/route.ts
import { listChats } from "@/lib/chat-storage";

export async function GET() {
  const conversations = await listChats();
  return Response.json(conversations);
}
