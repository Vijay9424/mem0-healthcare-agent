// lib/mem0.ts
import { Memory } from "mem0ai/oss";

/**
 * GRAPH-ONLY MEMORY CONFIGURATION
 * 
 * This configuration uses Neo4j for relationship-based memory storage.
 * 
 * Why graph-only?
 * - Neo4j stores entities and relationships (people, symptoms, treatments, etc.)
 * - Embeddings are computed on-the-fly during search, not stored separately
 * - No external vector DB (Qdrant) required
 * - Faster for healthcare use case (structured medical data)
 * - Relationships are queryable and explainable
 * 
 * Data flow:
 * 1. memory.add(messages) → Extract entities → Store in Neo4j
 * 2. memory.search(query) → Embed query → Find related entities → Return results
 * 3. Graph stores: patient → has_symptom → anger_issues, etc.
 */

// Validate required environment variables
function validateEnv() {
  const required = [
    "NEO4J_URL",
    "NEO4J_USERNAME",
    "NEO4J_PASSWORD",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for Mem0 graph memory: ${missing.join(", ")}\n` +
        `Please set these in your .env.local file.`
    );
  }
}

validateEnv();

/**
 * Initialize Mem0 with Neo4j graph store only
 * 
 * Configuration breakdown:
 * - embedder: OpenAI text-embedding-3-small (used for semantic search, not storage)
 * - llm: OpenAI gpt-4o (used for entity extraction from conversations)
 * - graphStore: Neo4j (stores all relationships and entities)
 * - enableGraph: true (activates relationship extraction and storage)
 * 
 * NO vector store configured → Qdrant not required
 */
export const memory = new Memory({
  // ✅ Embedder for semantic search (embeddings computed on-the-fly, not stored)
  embedder: {
    provider: "openai",
    config: {
      apiKey: process.env.OPENAI_API_KEY!,
      model: "text-embedding-3-small",
    },
  },

  // ✅ LLM for entity extraction (converts text → structured relationships)
  llm: {
    provider: "openai",
    config: {
      apiKey: process.env.OPENAI_API_KEY!,
      model: "gpt-4o",
    },
  },

  // ✅ Graph store configuration (Neo4j)
  // This is where all patient data, symptoms, treatments, and relationships live
  enableGraph: true,
  graphStore: {
    provider: "neo4j",
    config: {
      url: process.env.NEO4J_URL!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
      // Optional: specify database name (defaults to "neo4j")
      // database: process.env.NEO4J_DATABASE ?? "neo4j",
    },
    // Optional: customize entity extraction
    // customPrompt: "Extract only medical entities: symptoms, diagnoses, medications, treatments, and relationships between them.",
  },

  // ✅ History store (SQLite) - stores metadata about memory operations
  // This is separate from Neo4j and tracks when memories were added/updated
  historyDbPath: "./.mem0/history.db",

  // ✅ Disable default vector store (we're using graph-only mode)
  // Mem0 will NOT try to connect to Qdrant
});
