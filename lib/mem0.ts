// lib/mem0.ts
import { Memory } from "mem0ai/oss";

export const memory = new Memory({
  // ✅ Turn on graph memory globally (official pattern)
  enableGraph: true,
  graphStore: {
    provider: "neo4j",
    config: {
      url: process.env.NEO4J_URL!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
      // database: process.env.NEO4J_DATABASE ?? "neo4j", // optional
    },
  },
  // You can later customize embedder, vectorStore, llm...
  // For now we keep Mem0 defaults (OpenAI embedder + in-memory vector store + SQLite history) :contentReference[oaicite:1]{index=1}
});
