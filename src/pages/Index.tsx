import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, PanelRightOpen, PanelRightClose, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/ChatMessage";
import { DocumentPanel } from "@/components/DocumentPanel";
import { streamChat, type ChatMessage as ChatMsg } from "@/lib/chat-stream";
import { type ProcessedDocument } from "@/lib/document-processor";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTIONS = [
  "Summarize the key findings on climate change impacts",
  "What are the latest advances in quantum computing?",
  "Compare different machine learning architectures",
  "Explain CRISPR gene editing technology",
];

export default function Index() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Document context is now auto-retrieved from the vector DB by the chat edge function

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

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
      documentContext,
      onDelta: upsert,
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setIsLoading(false);
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

  return (
    <div className="flex h-screen bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Research Assistant</h1>
              <p className="text-xs text-muted-foreground">AI-powered research workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocs(!showDocs)}
              className="gap-1.5"
            >
              {showDocs ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              Docs {documents.length > 0 && `(${documents.length})`}
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center max-w-lg"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    What would you like to research?
                  </h2>
                  <p className="text-sm text-muted-foreground mb-8">
                    Ask research questions, upload documents for context, and get AI-powered answers with sources.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-xs px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/80 transition-colors text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto py-4">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChatMessage
                        message={msg}
                        isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a research question..."
              className="min-h-[44px] max-h-32 resize-none bg-background rounded-xl text-sm"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="rounded-xl h-[44px] w-[44px] flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Document Panel */}
      <AnimatePresence>
        {showDocs && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <DocumentPanel
              documents={documents}
              onDocumentProcessed={(doc) => setDocuments(prev => [...prev, doc])}
              onRemoveDocument={(idx) => setDocuments(prev => prev.filter((_, i) => i !== idx))}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
