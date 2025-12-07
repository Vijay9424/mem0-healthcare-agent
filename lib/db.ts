// lib/db.ts
import Database from "better-sqlite3";

const db = new Database("chats.db");

// Optional but good for concurrency
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    role TEXT,
    patientId TEXT,
    title TEXT,
    createdAt INTEGER,
    updatedAt INTEGER,
    lastMessage TEXT,
    messages TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chats_updatedAt ON chats(updatedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_chats_patientId ON chats(patientId);
  CREATE INDEX IF NOT EXISTS idx_chats_role ON chats(role);
`);

export default db;
