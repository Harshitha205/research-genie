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
    const { messages, documentContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Search for relevant chunks based on the last user message
    let relevantContext = documentContext || "";
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    
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
        const chunkContext = chunks.map((c: any) =>
          `[Source: ${c.file_name}, Chunk ${c.chunk_index + 1}]\n${c.content}`
        ).join("\n\n---\n\n");
        relevantContext = relevantContext
          ? `${relevantContext}\n\n--- Retrieved from vector database ---\n\n${chunkContext}`
          : chunkContext;
      }
    }

    const systemPrompt = `You are an expert AI research assistant. Your role is to help users with research questions by providing thorough, well-sourced answers.

When answering:
1. Provide clear, structured answers with headings and bullet points when appropriate
2. Always cite sources when making claims - use numbered references like [1], [2], etc.
3. At the end of your response, include a "## Sources" section listing all referenced sources
4. If document context is provided, reference specific parts of those documents with the source file name
5. Be honest about uncertainty - if you're not sure, say so
6. Suggest follow-up research directions when relevant

${relevantContext ? `The following document chunks were retrieved as relevant context:\n\n${relevantContext}` : ""}`;

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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
