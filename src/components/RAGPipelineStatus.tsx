import { Search, Database, Bot, CheckCircle, AlertCircle, ShieldCheck } from "lucide-react";
import type { PipelineInfo, CriticInfo } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: PipelineInfo | null;
  critic: CriticInfo | null;
  isLoading: boolean;
  stage: "idle" | "retrieving" | "generating" | "critiquing" | "done";
}

const steps = [
  { key: "query", label: "Query received", icon: Search },
  { key: "retrieve", label: "Retrieving chunks", icon: Database },
  { key: "generate", label: "Generating draft", icon: Bot },
  { key: "critique", label: "Critic review", icon: ShieldCheck },
  { key: "done", label: "Complete", icon: CheckCircle },
] as const;

function getActiveStep(stage: Props["stage"]) {
  switch (stage) {
    case "idle": return -1;
    case "retrieving": return 1;
    case "generating": return 2;
    case "critiquing": return 3;
    case "done": return 4;
  }
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 4 ? "text-primary bg-primary/10" : score >= 3 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return <span className={cn("px-1.5 py-0.5 rounded text-xs font-mono font-bold", color)}>{score}/5</span>;
}

export function RAGPipelineStatus({ pipeline, critic, isLoading, stage }: Props) {
  if (stage === "idle") return null;

  const activeStep = getActiveStep(stage);

  return (
    <div className="max-w-3xl mx-auto px-4 py-2">
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        {/* Pipeline steps */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            const isPending = i > activeStep;

            return (
              <div key={step.key} className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                    isDone && "bg-primary/15 text-primary",
                    isActive && "bg-primary text-primary-foreground",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="w-2.5 h-2.5" />
                </div>
                <span className={cn(
                  "text-[10px] hidden sm:inline whitespace-nowrap",
                  isDone && "text-primary",
                  isActive && "text-foreground font-semibold",
                  isPending && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={cn("w-4 h-px flex-shrink-0", isDone ? "bg-primary/40" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Retrieval info */}
        {pipeline && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {pipeline.hasContext ? (
              <span className="flex items-center gap-1 text-primary">
                <CheckCircle className="w-3 h-3" />
                {pipeline.chunksRetrieved} chunks retrieved
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning">
                <AlertCircle className="w-3 h-3" />
                No matching documents
              </span>
            )}
          </div>
        )}

        {/* Critic evaluation */}
        {critic?.evaluation && (
          <div className="border-t border-border pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                Critic Agent Review
              </span>
              <div className="flex items-center gap-2">
                <ScoreBadge score={critic.evaluation.overall_score} />
                {critic.wasImproved && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                    Improved
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {Object.entries(critic.evaluation.evaluation).map(([key, val]) => (
                <div key={key} className="text-center">
                  <div className="text-[9px] text-muted-foreground capitalize">
                    {key.replace(/_/g, " ").replace("answers question", "relevance")}
                  </div>
                  <ScoreBadge score={val.score} />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground italic">
              {critic.evaluation.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
