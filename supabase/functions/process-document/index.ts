import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTextChunks(text: string, chunkSize = 750, overlap = 150): { content: string; tokenCount: number }[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks: { content: string; tokenCount: number }[] = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    const content = chunkWords.join(" ");
    if (content.trim()) {
      chunks.push({ content: content.trim(), tokenCount: chunkWords.length });
    }
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
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const raw = decoder.decode(bytes);

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

      text = textParts.length > 0
        ? textParts.join("\n\n")
        : raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } else {
      throw new Error("Unsupported file type. Please upload PDF, TXT, MD, or CSV files.");
    }

    if (!text.trim()) {
      throw new Error("Could not extract text from the document.");
    }

    const chunks = extractTextChunks(text);
    const preview = text.slice(0, 500);

    // Store in database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: file.name,
        file_size: file.size,
        total_chunks: chunks.length,
        preview,
      })
      .select("id")
      .single();

    if (docError) throw new Error(`Failed to store document: ${docError.message}`);

    const chunkRows = chunks.map((c, i) => ({
      document_id: doc.id,
      chunk_index: i,
      content: c.content,
      token_count: c.tokenCount,
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: chunkError } = await supabase.from("document_chunks").insert(batch);
      if (chunkError) throw new Error(`Failed to store chunks: ${chunkError.message}`);
    }

    return new Response(JSON.stringify({
      id: doc.id,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: chunks.length,
      preview,
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
