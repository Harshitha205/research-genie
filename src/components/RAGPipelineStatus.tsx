import { Search, Database, Bot, CheckCircle, AlertCircle, ShieldCheck, BadgeCheck, CircleAlert } from "lucide-react";
import type { PipelineInfo, CriticInfo, VerifierInfo } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  pipeline: PipelineInfo | null;
  critic: CriticInfo | null;
  verifier: VerifierInfo | null;
  isLoading: boolean;
  stage: "idle" | "retrieving" | "generating" | "critiquing" | "verifying" | "done";
}

const steps = [
  { key: "query", label: "Query received", icon: Search },
  { key: "retrieve", label: "Retrieving chunks", icon: Database },
  { key: "generate", label: "Generating draft", icon: Bot },
  { key: "critique", label: "Critic review", icon: ShieldCheck },
  { key: "verify", label: "Verifier check", icon: BadgeCheck },
  { key: "done", label: "Complete", icon: CheckCircle },
] as const;

function getActiveStep(stage: Props["stage"]) {
  switch (stage) {
    case "idle": return -1;
    case "retrieving": return 1;
    case "generating": return 2;
    case "critiquing": return 3;
    case "verifying": return 4;
    case "done": return 5;
  }
}

function ScoreBadge({ score, max = 5 }: { score: number; max?: number }) {
  const ratio = score / max;
  const color = ratio >= 0.8 ? "text-primary bg-primary/10" : ratio >= 0.6 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return <span className={cn("px-1.5 py-0.5 rounded text-xs font-mono font-bold", color)}>{score}/{max}</span>;
}

function ConfidenceBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 0.8 ? "text-primary bg-primary/10" : score >= 0.5 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", color)}>
      {label} ({Math.round(score * 100)}%)
    </span>
  );
}

export function RAGPipelineStatus({ pipeline, critic, verifier, isLoading, stage }: Props) {
  if (stage === "idle") return null;

  const activeStep = getActiveStep(stage);

  return (
    <div className="max-w-3xl mx-auto px-4 py-2">
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        {/* Pipeline steps */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            const isPending = i > activeStep;

            return (
              <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
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
                  <div className={cn("w-3 h-px flex-shrink-0", isDone ? "bg-primary/40" : "bg-border")} />
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

        {/* Verifier evaluation */}
        {verifier?.evaluation && (
          <div className="border-t border-border pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                Verifier Agent
              </span>
              <div className="flex items-center gap-2">
                <ConfidenceBadge score={verifier.evaluation.confidence_score} label={verifier.evaluation.confidence_label} />
                {verifier.wasVerified && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                    Corrected
                  </span>
                )}
              </div>
            </div>

            {/* Claims breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center px-2 py-1 rounded bg-primary/5">
                <div className="text-[9px] text-muted-foreground">Supported</div>
                <span className="text-xs font-bold text-primary">{verifier.evaluation.supported}</span>
              </div>
              <div className="text-center px-2 py-1 rounded bg-warning/5">
                <div className="text-[9px] text-muted-foreground">Partial</div>
                <span className="text-xs font-bold text-warning">{verifier.evaluation.partially_supported}</span>
              </div>
              <div className="text-center px-2 py-1 rounded bg-destructive/5">
                <div className="text-[9px] text-muted-foreground">Unsupported</div>
                <span className="text-xs font-bold text-destructive">{verifier.evaluation.unsupported}</span>
              </div>
            </div>

            {/* Individual claims */}
            {verifier.evaluation.claims.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {verifier.evaluation.claims.map((claim, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    {claim.status === "supported" ? (
                      <CheckCircle className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    ) : claim.status === "partially_supported" ? (
                      <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
                    ) : (
                      <CircleAlert className="w-3 h-3 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <span className="text-muted-foreground">
                      {claim.claim}
                      {claim.source_ref && <span className="text-primary ml-1">{claim.source_ref}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {verifier.evaluation.hallucination_detected && (
              <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/5 rounded px-2 py-1">
                <CircleAlert className="w-3.5 h-3.5" />
                Hallucination detected — response was corrected
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">
              {verifier.evaluation.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
