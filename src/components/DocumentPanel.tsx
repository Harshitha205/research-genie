import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { processDocument, type ProcessedDocument } from "@/lib/document-processor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  documents: ProcessedDocument[];
  onDocumentProcessed: (doc: ProcessedDocument) => void;
  onRemoveDocument: (idx: number) => void;
}

export function DocumentPanel({ documents, onDocumentProcessed, onRemoveDocument }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    const validTypes = [".pdf", ".txt", ".md", ".csv"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      toast.error("Unsupported file type. Please upload PDF, TXT, MD, or CSV files.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }

    setIsProcessing(true);
    try {
      const doc = await processDocument(file);
      onDocumentProcessed(doc);
      toast.success(`"${doc.fileName}" processed — ${doc.totalChunks} chunks extracted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process document");
    } finally {
      setIsProcessing(false);
    }
  }, [onDocumentProcessed]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Documents
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Upload research documents for AI context
        </p>
      </div>

      <div className="p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
            isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".pdf,.txt,.md,.csv";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            input.click();
          }}
        >
          {isProcessing ? (
            <Loader2 className="w-6 h-6 mx-auto text-primary animate-spin" />
          ) : (
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {isProcessing ? "Processing..." : "Drop files or click to upload"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">PDF, TXT, MD, CSV</p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 pb-4">
          {documents.map((doc, idx) => (
            <div key={idx} className="bg-secondary/50 rounded-lg border border-border">
              <div className="flex items-center gap-2 p-3">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.totalChunks} chunks · {(doc.fileSize / 1024).toFixed(1)}KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setExpandedDoc(expandedDoc === idx ? null : idx)}
                >
                  {expandedDoc === idx ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveDocument(idx)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {expandedDoc === idx && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono leading-relaxed max-h-32 overflow-auto">
                    {doc.preview}...
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
