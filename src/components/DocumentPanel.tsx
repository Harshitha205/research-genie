import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, ChevronDown, ChevronUp, Database, Globe, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processDocument, type ProcessedDocument } from "@/lib/document-processor";
import { ingestUrl } from "@/lib/url-ingestor";
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
  const [urlInput, setUrlInput] = useState("");

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
      onDocumentProcessed({ ...doc, sourceType: "file" });
      toast.success(`"${doc.fileName}" ingested — ${doc.totalChunks} chunks stored`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process document");
    } finally {
      setIsProcessing(false);
    }
  }, [onDocumentProcessed]);

  const handleUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setIsProcessing(true);
    try {
      const doc = await ingestUrl(urlInput.trim());
      onDocumentProcessed({
        id: doc.id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        totalChunks: doc.totalChunks,
        preview: doc.preview,
        sourceType: "url",
        sourceUrl: doc.sourceUrl,
      });
      toast.success(`"${doc.fileName}" ingested — ${doc.totalChunks} chunks stored`);
      setUrlInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ingest URL");
    } finally {
      setIsProcessing(false);
    }
  }, [urlInput, onDocumentProcessed]);

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
          Knowledge Sources
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Add documents & URLs for multisource retrieval
        </p>
      </div>

      <Tabs defaultValue="file" className="flex-1 flex flex-col">
        <div className="px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1 gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              Files
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1 gap-1.5 text-xs">
              <Globe className="w-3.5 h-3.5" />
              Web URLs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="file" className="flex-1 flex flex-col mt-0 px-4 pt-3">
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
        </TabsContent>

        <TabsContent value="url" className="flex-1 flex flex-col mt-0 px-4 pt-3">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/article"
                className="text-xs h-9"
                disabled={isProcessing}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <Button
                size="sm"
                onClick={handleUrl}
                disabled={!urlInput.trim() || isProcessing}
                className="h-9 px-3"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a web URL to scrape, chunk, and index its content for retrieval.
            </p>
          </div>
        </TabsContent>

        {/* Pipeline info */}
        <div className="px-4 py-3">
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Multisource Retrieval Pipeline:</p>
            <p>1. Ingest from files or web URLs</p>
            <p>2. Extract text & split into 500–1000 token chunks</p>
            <p>3. Index with full-text search (pgvector)</p>
            <p>4. Semantic search retrieves top 5 relevant chunks</p>
            <p>5. Sources displayed with name, type & location</p>
          </div>
        </div>

        {/* Document list */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-2 pb-4">
            {documents.map((doc, idx) => (
              <div key={doc.id} className="bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 p-3">
                  {doc.sourceType === "url" ? (
                    <Globe className="w-4 h-4 text-accent flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.totalChunks} chunks · {(doc.fileSize / 1024).toFixed(1)}KB · {doc.sourceType === "url" ? "Web" : "File"} · Indexed ✓
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
                  <div className="px-3 pb-3 space-y-1">
                    {doc.sourceUrl && (
                      <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">
                        {doc.sourceUrl}
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono leading-relaxed max-h-32 overflow-auto">
                      {doc.preview}...
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
