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
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      throw new Error("Invalid URL format");
    }

    console.log("Ingesting URL:", parsedUrl.href);

    // Fetch the webpage
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchAssistant/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    let text = "";
    let title = parsedUrl.hostname;

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      // Extract title
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();

      // Remove scripts, styles, nav, footer, header
      text = rawText
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      // Plain text or other
      text = rawText.trim();
    }

    if (!text || text.length < 50) {
      throw new Error("Could not extract meaningful content from the URL. The page may require JavaScript or authentication.");
    }

    const chunks = extractTextChunks(text);
    const preview = text.slice(0, 500);
    const fileSize = new Blob([rawText]).size;

    // Store in database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        file_name: title,
        file_size: fileSize,
        total_chunks: chunks.length,
        preview,
        source_type: "url",
        source_url: parsedUrl.href,
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

    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: chunkError } = await supabase.from("document_chunks").insert(batch);
      if (chunkError) throw new Error(`Failed to store chunks: ${chunkError.message}`);
    }

    return new Response(JSON.stringify({
      id: doc.id,
      fileName: title,
      fileSize,
      totalChunks: chunks.length,
      preview,
      sourceType: "url",
      sourceUrl: parsedUrl.href,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-url error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
