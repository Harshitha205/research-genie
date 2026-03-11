import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, messages: any[], stream = false) {
  const response = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      stream,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw { status: 429, message: "Rate limit exceeded. Please try again in a moment." };
    if (status === 402) throw { status: 402, message: "AI usage limit reached. Please add credits." };
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    throw { status: 500, message: "AI service error" };
  }

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── STEP 1: Accept user query ──
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (!lastUserMsg) throw new Error("No user message found");

    // ── STEP 2: Retrieve relevant chunks ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: chunks, error: searchError } = await supabase.rpc("search_chunks", {
      query_text: lastUserMsg.content,
      match_limit: 5,
    });

    if (searchError) console.error("Retrieval error:", searchError);

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

    const contextBlock = hasContext
      ? chunks.map((c: any, i: number) => {
          const type = c.source_type === "url" ? "Web" : "Document";
          const url = c.source_url ? ` | URL: ${c.source_url}` : "";
          return `### Source [${i + 1}]\n- **Name:** ${c.file_name}\n- **Type:** ${type}${url}\n- **Location:** Chunk ${c.chunk_index + 1}\n\n**Content:**\n${c.content}`;
        }).join("\n\n---\n\n")
      : "";

    // ── STEP 3: Generate initial RAG response (non-streaming) ──
    const ragSystemPrompt = `You are a RAG research assistant. Answer ONLY from the retrieved context. Never use pre-trained knowledge for factual claims.

## RULES
- If no context is retrieved, say so clearly.
- Cite every claim with [Source N].
- Include a ## Citations section and ## Confidence level (High/Medium/Low/None).

${hasContext ? `## RETRIEVED CONTEXT (${retrievedSources.length} chunks)\n\n${contextBlock}` : "## NO CONTEXT RETRIEVED"}`;

    const initialResponse = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: ragSystemPrompt },
      ...messages,
    ], false);

    const initialData = await initialResponse.json();
    const initialAnswer = initialData.choices?.[0]?.message?.content || "";

    // ── STEP 4: Critic Agent reviews the response ──
    const criticPrompt = `You are a Critic Agent. Your job is to review an AI-generated research response and improve it.

## THE USER'S QUESTION
${lastUserMsg.content}

## THE AI'S DRAFT RESPONSE
${initialAnswer}

${hasContext ? `## THE RETRIEVED CONTEXT THAT WAS AVAILABLE\n\n${contextBlock}` : "No context was retrieved."}

## YOUR TASK
Evaluate the draft response on these criteria:

1. **Logical Consistency** — Are there contradictions, non-sequiturs, or flawed reasoning?
2. **Question Answering** — Does it actually answer the user's question fully and directly?
3. **Clarity** — Is the language clear, well-organized, and easy to follow?
4. **Completeness** — Does it use all relevant information from the retrieved context?
5. **Citation Accuracy** — Are citations correctly placed and do they match the actual source content?

## OUTPUT FORMAT
You MUST output your response in this exact format:

---CRITIQUE_START---
{
  "issues_found": true/false,
  "evaluation": {
    "logical_consistency": { "score": 1-5, "note": "..." },
    "answers_question": { "score": 1-5, "note": "..." },
    "clarity": { "score": 1-5, "note": "..." },
    "completeness": { "score": 1-5, "note": "..." },
    "citation_accuracy": { "score": 1-5, "note": "..." }
  },
  "overall_score": 1-5,
  "summary": "Brief summary of issues found or quality assessment"
}
---CRITIQUE_END---

If issues_found is true OR overall_score < 4, then ALSO output an improved response after the critique block:

---IMPROVED_START---
[Your improved, rewritten response here — follow the same format rules: citations, ## Citations section, ## Confidence level]
---IMPROVED_END---

If the response is already good (overall_score >= 4 and no issues), do NOT output the improved section.`;

    const criticResponse = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: "You are a meticulous Critic Agent that evaluates and improves AI responses." },
      { role: "user", content: criticPrompt },
    ], false);

    const criticData = await criticResponse.json();
    const criticOutput = criticData.choices?.[0]?.message?.content || "";

    // Parse critic output
    let criticEvaluation: any = null;
    let finalAnswer = initialAnswer;
    let wasImproved = false;

    // Extract critique JSON
    const critiqueMatch = criticOutput.match(/---CRITIQUE_START---\s*([\s\S]*?)\s*---CRITIQUE_END---/);
    if (critiqueMatch) {
      try {
        criticEvaluation = JSON.parse(critiqueMatch[1].trim());
      } catch {
        console.error("Failed to parse critic evaluation");
      }
    }

    // Extract improved response if present
    const improvedMatch = criticOutput.match(/---IMPROVED_START---\s*([\s\S]*?)\s*---IMPROVED_END---/);
    if (improvedMatch && improvedMatch[1].trim().length > 50) {
      finalAnswer = improvedMatch[1].trim();
      wasImproved = true;
    }

    // ── STEP 5: Stream the final response to the client ──
    const pipelineMetadata = {
      retrievedSources,
      pipeline: {
        query: lastUserMsg.content,
        chunksRetrieved: retrievedSources.length,
        hasContext,
      },
      critic: {
        evaluation: criticEvaluation,
        wasImproved,
        originalLength: initialAnswer.length,
        finalLength: finalAnswer.length,
      },
    };

    const encoder = new TextEncoder();

    // Stream the final answer as SSE to maintain compatibility
    const stream = new ReadableStream({
      start(controller) {
        // Send metadata header
        const header = JSON.stringify(pipelineMetadata) + "\n---STREAM_START---\n";
        controller.enqueue(encoder.encode(header));

        // Send final answer as SSE chunks (simulate streaming for consistent UX)
        const chunkSize = 20;
        for (let i = 0; i < finalAnswer.length; i += chunkSize) {
          const textChunk = finalAnswer.slice(i, i + chunkSize);
          const sseData = JSON.stringify({
            choices: [{ delta: { content: textChunk } }],
          });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e: any) {
    console.error("chat error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
