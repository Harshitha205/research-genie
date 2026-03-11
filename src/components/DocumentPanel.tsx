import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, ChevronDown, ChevronUp, Database } from "lucide-react";
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
      toast.success(`"${doc.fileName}" ingested — ${doc.totalChunks} chunks stored in vector DB`);
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
          <Database className="w-4 h-4 text-primary" />
          Document Ingestion
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Upload documents → chunked → stored in vector DB
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
            {isProcessing ? "Extracting & chunking..." : "Drop files or click to upload"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">PDF, TXT, MD, CSV · Max 20MB</p>
        </div>
      </div>

      {/* Pipeline info */}
      <div className="px-4 pb-3">
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Ingestion Pipeline:</p>
          <p>1. Extract text from document</p>
          <p>2. Split into 500–1000 token chunks</p>
          <p>3. Store with full-text search index</p>
          <p>4. Auto-retrieved during chat queries</p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 pb-4">
          {documents.map((doc, idx) => (
            <div key={doc.id} className="bg-secondary/50 rounded-lg border border-border">
              <div className="flex items-center gap-2 p-3">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.totalChunks} chunks · {(doc.fileSize / 1024).toFixed(1)}KB · Indexed ✓
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
