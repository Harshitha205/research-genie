import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── STEP 1: Accept user query ──
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (!lastUserMsg) throw new Error("No user message found");

    // ── STEP 2: Retrieve relevant document chunks from vector database ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: chunks, error: searchError } = await supabase.rpc("search_chunks", {
      query_text: lastUserMsg.content,
      match_limit: 5,
    });

    if (searchError) {
      console.error("Retrieval error:", searchError);
    }

    const hasContext = chunks && chunks.length > 0;

    const retrievedSources = hasContext
      ? chunks.map((c: any, i: number) => ({
          index: i + 1,
          sourceName: c.file_name,
          sourceType: c.source_type || "file",
          sourceUrl: c.source_url || null,
          location: `Chunk ${c.chunk_index + 1}`,
          relevance: c.rank,
        }))
      : [];

    // ── STEP 3: Provide retrieved context to the LLM ──
    const contextBlock = hasContext
      ? chunks.map((c: any, i: number) => {
          const type = c.source_type === "url" ? "Web" : "Document";
          const url = c.source_url ? ` | URL: ${c.source_url}` : "";
          return `### Source [${i + 1}]\n- **Name:** ${c.file_name}\n- **Type:** ${type}${url}\n- **Location:** Chunk ${c.chunk_index + 1}\n- **Relevance Score:** ${(c.rank * 100).toFixed(1)}%\n\n**Content:**\n${c.content}`;
        }).join("\n\n---\n\n")
      : "";

    // ── STEP 4: Generate response based ONLY on retrieved context ──
    const systemPrompt = `You are a Retrieval-Augmented Generation (RAG) research assistant. You MUST follow these rules strictly:

## CRITICAL RULES
1. **Answer ONLY from the retrieved context below.** Do NOT use your pre-trained knowledge to answer factual questions.
2. **If no relevant context is retrieved**, clearly state: "I could not find relevant information in the knowledge base. Please upload documents or add web URLs related to your question."
3. **Never fabricate or hallucinate information** not present in the retrieved context.

## CITATION RULES
- Every claim MUST include an inline citation using the format [Source N] where N matches the source index.
- When synthesizing across sources, cite all relevant sources: [Source 1][Source 3].
- Direct quotes must use quotation marks with citation: "exact text" [Source 2].

## RESPONSE FORMAT
Structure your response as:

1. **Answer** — A clear, well-structured answer with inline citations [Source N]
2. **## Citations** — A numbered list of all sources used:
   - [Source 1] Document/Web: name, location
   - [Source 2] Document/Web: name, location
3. **## Confidence** — State your confidence level:
   - **High**: Multiple sources corroborate the answer
   - **Medium**: Answer from a single source or partial match
   - **Low**: Tangential relevance only
   - **None**: No relevant context found

${hasContext
  ? `## RETRIEVED CONTEXT (${retrievedSources.length} chunks)\n\n${contextBlock}`
  : "## NO CONTEXT RETRIEVED\nThe knowledge base returned no matching documents for this query."}`;

    // Build metadata header
    const pipelineMetadata = {
      retrievedSources,
      pipeline: {
        query: lastUserMsg.content,
        chunksRetrieved: retrievedSources.length,
        hasContext,
      },
    };

    const sourceHeader = JSON.stringify(pipelineMetadata) + "\n---STREAM_START---\n";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const aiBody = response.body!;

    const combinedStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sourceHeader));
        const reader = aiBody.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(combinedStream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
