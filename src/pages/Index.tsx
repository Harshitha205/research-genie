import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, FileText, Globe, Trash2, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/ChatMessage";
import { SourcesPanel } from "@/components/SourcesPanel";
import { RAGPipelineStatus } from "@/components/RAGPipelineStatus";
import { DocumentPanel } from "@/components/DocumentPanel";
import { streamChat, type ChatMessage as ChatMsg, type RetrievedSource, type PipelineInfo, type CriticInfo, type VerifierInfo } from "@/lib/chat-stream";
import { type ProcessedDocument } from "@/lib/document-processor";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTIONS = [
  { text: "Summarize key findings", icon: FileText },
  { text: "Compare viewpoints across sources", icon: Globe },
  { text: "Find claims with evidence", icon: Zap },
  { text: "What topics are covered?", icon: ChevronRight },
];

export default function Index() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [latestSources, setLatestSources] = useState<RetrievedSource[]>([]);
  const [pipelineInfo, setPipelineInfo] = useState<PipelineInfo | null>(null);
  const [criticInfo, setCriticInfo] = useState<CriticInfo | null>(null);
  const [verifierInfo, setVerifierInfo] = useState<VerifierInfo | null>(null);
  const [pipelineStage, setPipelineStage] = useState<"idle" | "retrieving" | "generating" | "critiquing" | "verifying" | "done">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, latestSources, pipelineStage, criticInfo, verifierInfo]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setLatestSources([]);
    setPipelineInfo(null);
    setCriticInfo(null);
    setVerifierInfo(null);
    setPipelineStage("retrieving");

    let assistantContent = "";
    const upsert = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };

    await streamChat({
      messages: [...messages, userMsg],
      onSources: (sources) => {
        setLatestSources(sources);
        setPipelineStage("generating");
      },
      onPipeline: (info) => {
        setPipelineInfo(info);
        setPipelineStage("critiquing");
      },
      onCritic: (info) => {
        setCriticInfo(info);
        setPipelineStage("verifying");
      },
      onVerifier: (info) => {
        setVerifierInfo(info);
      },
      onDelta: (chunk) => {
        if (pipelineStage !== "done") setPipelineStage("done");
        upsert(chunk);
      },
      onDone: () => {
        setIsLoading(false);
        setPipelineStage("done");
      },
      onError: (err) => {
        setIsLoading(false);
        setPipelineStage("idle");
        toast.error(err);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setLatestSources([]);
    setPipelineInfo(null);
    setCriticInfo(null);
    setVerifierInfo(null);
    setPipelineStage("idle");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* LEFT: Document Panel - always visible */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-card/50">
        <DocumentPanel
          documents={documents}
          onDocumentProcessed={(doc) => setDocuments(prev => [...prev, doc])}
          onRemoveDocument={(idx) => setDocuments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      {/* CENTER: Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground tracking-tight">Research Workspace</h1>
              <p className="text-[10px] text-muted-foreground">RAG · Critic · Verifier pipeline</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive h-7 text-xs gap-1">
              <Trash2 className="w-3 h-3" /> Clear
            </Button>
          )}
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-4 gradient-mesh">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center max-w-md">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center mx-auto mb-5 shadow-sm">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-1.5 tracking-tight">Research Assistant</h2>
                  <p className="text-xs text-muted-foreground mb-5 leading-relaxed max-w-sm mx-auto">
                    Ask questions grounded in your uploaded documents. Every answer goes through retrieval, critique, and verification.
                  </p>

                  {/* Pipeline visualization */}
                  <div className="flex items-center justify-center gap-1 mb-5">
                    {["Retrieve", "Generate", "Critique", "Verify"].map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <span className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">{step}</span>
                        {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {SUGGESTIONS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.text}
                          onClick={() => send(s.text)}
                          className="flex items-center gap-2 text-left text-[11px] px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/80 hover:border-primary/20 transition-all text-foreground group"
                        >
                          <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                          {s.text}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="py-3">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                      <ChatMessage message={msg} isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-card/30 backdrop-blur-md p-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a research question..."
                  className="min-h-[40px] max-h-28 resize-none bg-background border-border rounded-lg text-sm pr-3 py-2.5"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="rounded-lg h-[40px] w-[40px] flex-shrink-0 bg-gradient-to-br from-primary to-primary/90 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            {isLoading && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "200ms" }} />
                  <span className="w-1 h-1 rounded-full bg-primary animate-pulse-soft" style={{ animationDelay: "400ms" }} />
                </div>
                <span className="text-[10px] text-muted-foreground">Processing through pipeline...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Context + Evaluation Panel */}
      <AnimatePresence>
        {(latestSources.length > 0 || pipelineStage !== "idle") && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex-shrink-0 border-l border-border bg-card/30 overflow-hidden"
          >
            <div className="w-[320px] h-full flex flex-col overflow-y-auto">
              {/* Pipeline Status */}
              {pipelineStage !== "idle" && (
                <div className="p-3 border-b border-border">
                  <RAGPipelineStatus pipeline={pipelineInfo} critic={criticInfo} verifier={verifierInfo} isLoading={isLoading} stage={pipelineStage} />
                </div>
              )}

              {/* Retrieved Sources */}
              {latestSources.length > 0 && (
                <div className="flex-1 p-3">
                  <SourcesPanel sources={latestSources} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
