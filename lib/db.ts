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
`);

export default db;
