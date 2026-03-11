import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTextChunks(text: string, chunkSize = 800, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    i += chunkSize - overlap;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("No file provided");

    let text = "";
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
      text = await file.text();
    } else if (fileName.endsWith(".pdf")) {
      // For PDF: extract raw text (basic extraction)
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const raw = decoder.decode(bytes);
      
      // Extract text between stream/endstream markers and clean up
      const textParts: string[] = [];
      const streamRegex = /stream\s*\n([\s\S]*?)endstream/g;
      let match;
      while ((match = streamRegex.exec(raw)) !== null) {
        const content = match[1]
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (content.length > 20) textParts.push(content);
      }
      
      if (textParts.length > 0) {
        text = textParts.join("\n\n");
      } else {
        // Fallback: extract any readable text
        text = raw
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s{3,}/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
    } else {
      throw new Error("Unsupported file type. Please upload PDF, TXT, MD, or CSV files.");
    }

    if (!text.trim()) {
      throw new Error("Could not extract text from the document. The file may be image-based or encrypted.");
    }

    const chunks = extractTextChunks(text);

    return new Response(JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      totalChunks: chunks.length,
      chunks,
      preview: text.slice(0, 500),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
