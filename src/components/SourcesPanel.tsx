import { FileText, Globe, ExternalLink, Search } from "lucide-react";
import type { RetrievedSource } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  sources: RetrievedSource[];
}

export function SourcesPanel({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-2">
      <div className="bg-muted/50 rounded-xl border border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Retrieved Sources ({sources.length})
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sources.map((source) => (
            <div
              key={source.index}
              className={cn(
                "flex items-start gap-2 p-2 rounded-lg bg-card border border-border text-xs",
                "hover:border-primary/30 transition-colors"
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {source.sourceType === "url" ? (
                  <Globe className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-muted-foreground">[{source.index}]</span>
                  <span className="font-medium text-foreground truncate">{source.sourceName}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  <span className="capitalize">{source.sourceType}</span> · {source.location}
                </div>
                {source.sourceUrl && (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline mt-0.5"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[150px]">{new URL(source.sourceUrl).hostname}</span>
                  </a>
                )}
                <div className="mt-0.5">
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${Math.min(source.relevance * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
