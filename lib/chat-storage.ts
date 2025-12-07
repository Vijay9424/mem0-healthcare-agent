// lib/chat-storage.ts
import type { UIMessage } from "ai";
import { generateId } from "ai";
import db from "./db";

export function createChat(): string {
  const id = generateId();
  const now = Date.now();
  const emptyMessages = "[]";

  const insert = db.prepare(
    `INSERT OR IGNORE INTO chats (id, createdAt, updatedAt, messages)
     VALUES (?, ?, ?, ?)`
  );

  insert.run(id, now, now, emptyMessages);

  return id;
}

export function loadChat(chatId: string): UIMessage[] {
  const row = db
    .prepare<[string], { messages: string }>(
      `SELECT messages FROM chats WHERE id = ?`
    )
    .get(chatId);

  if (!row?.messages) return [];

  try {
    return JSON.parse(row.messages) as UIMessage[];
  } catch {
    return [];
  }
}

interface SaveChatArgs {
  chatId: string;
  messages: UIMessage[];
  role?: string;
  patientId?: string;
}

export function saveChat({
  chatId,
  messages,
  role,
  patientId,
}: SaveChatArgs): void {
  const now = Date.now();
  const content = JSON.stringify(messages);

  const lastMessage = messages[messages.length - 1];
  const lastText =
    lastMessage?.parts
      ?.filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join(" ")
      .slice(0, 200) ?? null;

  const title =
    role && patientId ? `${role} ↔ Patient ${patientId}` : null;

  const existing = db
    .prepare<[string], { id: string }>(
      `SELECT id FROM chats WHERE id = ?`
    )
    .get(chatId);

  if (!existing) {
    const insert = db.prepare(
      `INSERT INTO chats (id, role, patientId, title, createdAt, updatedAt, lastMessage, messages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insert.run(
      chatId,
      role ?? null,
      patientId ?? null,
      title,
      now,
      now,
      lastText,
      content
    );
  } else {
    const update = db.prepare(
      `UPDATE chats
       SET role = COALESCE(?, role),
           patientId = COALESCE(?, patientId),
           title = COALESCE(?, title),
           updatedAt = ?,
           lastMessage = ?,
           messages = ?
       WHERE id = ?`
    );

    update.run(
      role ?? null,
      patientId ?? null,
      title,
      now,
      lastText,
      content,
      chatId
    );
  }
}

export function listChats() {
  const rows = db
    .prepare(
      `SELECT id, role, patientId, title, createdAt, updatedAt, lastMessage
       FROM chats
       ORDER BY updatedAt DESC`
    )
    .all() as {
    id: string;
    role: string | null;
    patientId: string | null;
    title: string | null;
    createdAt: number | null;
    updatedAt: number | null;
    lastMessage: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    patientId: row.patientId,
    title: row.title ?? `Conversation ${row.id}`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessage: row.lastMessage,
  }));
}
