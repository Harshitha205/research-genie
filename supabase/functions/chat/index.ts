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

    // Retrieve relevant chunks from all sources
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    let retrievedSources: any[] = [];
    let contextBlock = "";

    if (lastUserMsg) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: chunks } = await supabase.rpc("search_chunks", {
        query_text: lastUserMsg.content,
        match_limit: 5,
      });

      if (chunks && chunks.length > 0) {
        retrievedSources = chunks.map((c: any, i: number) => ({
          index: i + 1,
          sourceName: c.file_name,
          sourceType: c.source_type || "file",
          sourceUrl: c.source_url || null,
          location: `Chunk ${c.chunk_index + 1}`,
          relevance: c.rank,
        }));

        contextBlock = chunks.map((c: any, i: number) => {
          const sourceLabel = c.source_type === "url" 
            ? `[${i + 1}] Web: ${c.file_name} (${c.source_url}), Chunk ${c.chunk_index + 1}`
            : `[${i + 1}] Document: ${c.file_name}, Chunk ${c.chunk_index + 1}`;
          return `${sourceLabel}\n${c.content}`;
        }).join("\n\n---\n\n");
      }
    }

    const systemPrompt = `You are an expert AI research assistant with access to a multisource retrieval system. Your knowledge comes from uploaded documents, web pages, and external sources stored in a vector database.

When answering:
1. Provide clear, structured answers using markdown
2. Cite retrieved sources using their reference numbers [1], [2], etc.
3. Always include a "## Sources Used" section at the end listing each source with its name, type, and location
4. If retrieved context is relevant, synthesize information across multiple sources
5. Be transparent about what comes from retrieved sources vs general knowledge
6. Suggest follow-up queries or additional sources when relevant

${contextBlock ? `## Retrieved Context (Top ${retrievedSources.length} matches)\n\n${contextBlock}` : "No relevant documents found in the knowledge base."}`;

    // First, send source metadata as a JSON prefix before the stream
    const sourceHeader = JSON.stringify({ retrievedSources }) + "\n---STREAM_START---\n";

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

    // Create a combined stream: source metadata + AI response
    const encoder = new TextEncoder();
    const aiBody = response.body!;
    
    const combinedStream = new ReadableStream({
      async start(controller) {
        // Send source metadata first
        controller.enqueue(encoder.encode(sourceHeader));
        
        // Then pipe AI stream
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
      }
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
