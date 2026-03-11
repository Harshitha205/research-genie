import { Search, Database, Bot, CheckCircle, AlertCircle } from "lucide-react";
import type { PipelineInfo } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: PipelineInfo | null;
  isLoading: boolean;
  stage: "idle" | "retrieving" | "generating" | "done";
}

const steps = [
  { key: "query", label: "Query received", icon: Search },
  { key: "retrieve", label: "Retrieving from vector DB", icon: Database },
  { key: "generate", label: "Generating RAG response", icon: Bot },
  { key: "done", label: "Complete", icon: CheckCircle },
] as const;

function getActiveStep(stage: Props["stage"]) {
  switch (stage) {
    case "idle": return -1;
    case "retrieving": return 1;
    case "generating": return 2;
    case "done": return 3;
  }
}

export function RAGPipelineStatus({ pipeline, isLoading, stage }: Props) {
  if (stage === "idle") return null;

  const activeStep = getActiveStep(stage);

  return (
    <div className="max-w-3xl mx-auto px-4 py-2">
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            const isPending = i > activeStep;

            return (
              <div key={step.key} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                    isDone && "bg-primary/15 text-primary",
                    isActive && "bg-primary text-primary-foreground",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="w-3 h-3" />
                </div>
                <span
                  className={cn(
                    "text-xs hidden sm:inline",
                    isDone && "text-primary font-medium",
                    isActive && "text-foreground font-semibold",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={cn(
                    "w-6 h-px",
                    isDone ? "bg-primary/40" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {pipeline && stage !== "idle" && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {pipeline.hasContext ? (
              <span className="flex items-center gap-1 text-primary">
                <CheckCircle className="w-3 h-3" />
                {pipeline.chunksRetrieved} chunks retrieved
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning">
                <AlertCircle className="w-3 h-3" />
                No matching documents found
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
