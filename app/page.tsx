// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Send, Trash2, User, Bot } from "lucide-react";
import { format } from "date-fns";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

type Role = "doctor" | "nurse" | "receptionist";

interface Conversation {
  id: string;
  title: string;
  role: Role;
  patientId: string;
  createdAt: Date;
  lastMessage?: string;
}

export default function HomePage() {
  const [selectedRole, setSelectedRole] = useState<Role>("doctor");
  const [patientId, setPatientId] = useState<string>("patient-1");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    id: activeConversationId ?? undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      //Frontend ALWAYS sends full history + chatId (+ role + patientId)
      prepareSendMessagesRequest: ({ messages, id }) => {
        return {
          body: {
            messages,
            chatId: id,
            role: selectedRole,
            patientId,
          },
        };
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const activeConversation = conversations.find(
    (conv) => conv.id === activeConversationId
  );

  const filteredConversations = conversations.filter(
    (conv) => conv.role === selectedRole && conv.patientId === patientId
  );

  // Load persistent conversation list on first render
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;

        const data = await res.json();
        const mapped: Conversation[] = data.map((c: any) => ({
          id: c.id,
          title: c.title as string,
          role: c.role as Role,
          patientId: c.patientId as string,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          lastMessage: c.lastMessage ?? undefined,
        }));

        setConversations(mapped);
      } catch (error) {
        console.error("Failed to load conversations", error);
      }
    };

    loadConversations();
  }, []);

  // Create new conversation
  const handleNewConversation = () => {
    if (!patientId) {
      alert("Please select a patient ID.");
      return;
    }

    const newId = `conv-${Date.now()}`;

    const newConversation: Conversation = {
      id: newId,
      title: `${selectedRole} ↔ Patient ${patientId}`,
      role: selectedRole,
      patientId,
      createdAt: new Date(),
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newId);
    setMessages([]);
    setInput("");
  };

  // Select conversation (load from backend)
  const handleSelectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    setInput("");
    setMessages([]);

    try {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) {
        console.error("Failed to load conversation", await res.text());
        return;
      }
      const history = await res.json();
      setMessages(history);
    } catch (error) {
      console.error("Error loading conversation", error);
    }
  };

  // Delete conversation (only from UI for now)
  const handleDeleteConversation = (conversationId: string) => {
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;

    setConversations((prev) => prev.filter((c) => c.id !== conversationId));

    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setInput("");
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-emerald-400 mb-6">
            Healthcare Agent
          </h1>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="doctor">Doctor</option>
                <option value="nurse">Nurse</option>
                <option value="receptionist">Receptionist</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Patient ID</label>
              <input
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="e.g., patient-1"
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleNewConversation}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-medium text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Conversation
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-slate-400 mb-3 px-2">
            Conversations ({filteredConversations.length})
          </p>

          {filteredConversations.length === 0 ? (
            <p className="text-center text-sm text-slate-500 italic py-8">
              No conversations yet. Create one!
            </p>
          ) : (
            <div className="space-y-2">
              {filteredConversations.map((conv) => (
                <div key={conv.id} className="relative group rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full text-left p-4 rounded-lg transition-all ${
                      conv.id === activeConversationId
                        ? "bg-emerald-900/60 border border-emerald-600 shadow-lg"
                        : "bg-slate-800 hover:bg-slate-750 border border-transparent"
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {format(conv.createdAt, "MMM d, h:mm a")}
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                    className="absolute right-2 top-2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:bg-red-500/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        <header className="border-b border-slate-800 px-8 py-5 bg-slate-950/90 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold capitalize">{selectedRole} Mode</h2>
            {patientId && (
              <p className="text-sm text-slate-400 mt-1">
                Patient:{" "}
                <span className="font-mono text-emerald-400">{patientId}</span>
              </p>
            )}
          </div>
          <div className="text-sm text-slate-400">
            {activeConversation ? "Ready" : "No conversation selected"}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-gradient-to-b from-slate-950 to-slate-900">
          {messages.length === 0 && activeConversation && !isLoading && (
            <div className="text-center text-slate-500 mt-32">
              <p className="text-lg">Start chatting with the agent...</p>
              <p className="text-sm mt-2">AI responses are streamed live</p>
            </div>
          )}

          {messages.length === 0 && !activeConversation && (
            <div className="text-center text-slate-500 mt-32">
              <p className="text-lg">Create or select a conversation to begin</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-3 max-w-2xl ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center ${
                    msg.role === "user" ? "bg-emerald-600" : "bg-slate-700"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>

                <div
                  className={`rounded-2xl px-5 py-3 shadow-lg ${
                    msg.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-100 border border-slate-700"
                  }`}
                >
                  {msg.parts.map((part, idx) =>
                    part.type === "text" ? (
                      <p key={idx} className="whitespace-pre-wrap leading-relaxed">
                        {part.text}
                      </p>
                    ) : null
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator as an assistant bubble */}
          {activeConversation && isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-2xl">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center bg-slate-700">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="rounded-2xl px-5 py-3 shadow-lg bg-slate-800 text-slate-100 border border-slate-700">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.1s]" />
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        {activeConversation && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = input.trim();
              if (!text) return;

              // Send message to AI (full history + chatId handled by transport)
              sendMessage({ text });

              setInput("");
            }}
            className="border-t border-slate-800 p-6 bg-slate-950/90"
          >
            <div className="max-w-4xl mx-auto flex gap-4">
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={input.trim() === "" || isLoading}
                className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-medium text-white transition-all shadow-md flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
                Send
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
