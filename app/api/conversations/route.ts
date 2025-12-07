// app/api/conversations/route.ts
import { listChats } from "@/lib/chat-storage";

export function GET() {
  const conversations = listChats();
  return Response.json(conversations);
}
