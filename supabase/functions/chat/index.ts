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

function buildContextBlock(chunks: any[]) {
  return chunks.map((c: any, i: number) => {
    const type = c.source_type === "url" ? "Web" : "Document";
    const url = c.source_url ? ` | URL: ${c.source_url}` : "";
    return `### Source [${i + 1}]\n- **Name:** ${c.file_name}\n- **Type:** ${type}${url}\n- **Location:** Chunk ${c.chunk_index + 1}\n\n**Content:**\n${c.content}`;
  }).join("\n\n---\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (!lastUserMsg) throw new Error("No user message found");

    // ── STEP 1: Retrieve relevant chunks ──
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

    const contextBlock = hasContext ? buildContextBlock(chunks) : "";

    // ── STEP 2: Generate initial RAG response ──
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

    // ── STEP 3: Critic Agent reviews the response ──
    const criticPrompt = `You are a Critic Agent. Review the AI draft and improve it.

## USER QUESTION
${lastUserMsg.content}

## DRAFT RESPONSE
${initialAnswer}

${hasContext ? `## RETRIEVED CONTEXT\n\n${contextBlock}` : "No context retrieved."}

## TASK
Evaluate on: Logical Consistency, Question Answering, Clarity, Completeness, Citation Accuracy (each 1-5).

## OUTPUT FORMAT
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
  "summary": "..."
}
---CRITIQUE_END---

If issues_found is true OR overall_score < 4, also output:

---IMPROVED_START---
[Improved response with citations, ## Citations, ## Confidence level]
---IMPROVED_END---`;

    const criticResponse = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: "You are a meticulous Critic Agent." },
      { role: "user", content: criticPrompt },
    ], false);

    const criticData = await criticResponse.json();
    const criticOutput = criticData.choices?.[0]?.message?.content || "";

    let criticEvaluation: any = null;
    let postCriticAnswer = initialAnswer;
    let wasImproved = false;

    const critiqueMatch = criticOutput.match(/---CRITIQUE_START---\s*([\s\S]*?)\s*---CRITIQUE_END---/);
    if (critiqueMatch) {
      try { criticEvaluation = JSON.parse(critiqueMatch[1].trim()); } catch { console.error("Failed to parse critic evaluation"); }
    }

    const improvedMatch = criticOutput.match(/---IMPROVED_START---\s*([\s\S]*?)\s*---IMPROVED_END---/);
    if (improvedMatch && improvedMatch[1].trim().length > 50) {
      postCriticAnswer = improvedMatch[1].trim();
      wasImproved = true;
    }

    // ── STEP 4: Verifier Agent validates claims against sources ──
    const verifierPrompt = `You are a Verifier Agent. Your job is to validate every factual claim in the response against the retrieved source documents. Detect any hallucinated or unsupported claims.

## USER QUESTION
${lastUserMsg.content}

## RESPONSE TO VERIFY
${postCriticAnswer}

${hasContext ? `## SOURCE DOCUMENTS\n\n${contextBlock}` : "No source documents available."}

## YOUR TASK
1. Extract each factual claim from the response.
2. For each claim, check if it is SUPPORTED, PARTIALLY SUPPORTED, or UNSUPPORTED by the source documents.
3. Flag any hallucinated content (claims not found in sources).
4. If unsupported claims exist, rewrite the response removing or correcting them.
5. Assign an overall confidence score.

## OUTPUT FORMAT
---VERIFY_START---
{
  "claims": [
    { "claim": "...", "status": "supported|partially_supported|unsupported", "source_ref": "[Source N]" or null, "note": "..." }
  ],
  "total_claims": N,
  "supported": N,
  "partially_supported": N,
  "unsupported": N,
  "hallucination_detected": true/false,
  "confidence_score": 0.0-1.0,
  "confidence_label": "High|Medium|Low|None",
  "summary": "Brief verification summary"
}
---VERIFY_END---

If hallucination_detected is true OR confidence_score < 0.7, also output a corrected response:

---VERIFIED_RESPONSE_START---
[Corrected response with only supported claims, proper citations, ## Citations, ## Confidence level]
---VERIFIED_RESPONSE_END---`;

    const verifierResponse = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: "You are a rigorous Verifier Agent that validates AI responses against source documents." },
      { role: "user", content: verifierPrompt },
    ], false);

    const verifierData = await verifierResponse.json();
    const verifierOutput = verifierData.choices?.[0]?.message?.content || "";

    let verifierEvaluation: any = null;
    let finalAnswer = postCriticAnswer;
    let wasVerified = false;

    const verifyMatch = verifierOutput.match(/---VERIFY_START---\s*([\s\S]*?)\s*---VERIFY_END---/);
    if (verifyMatch) {
      try { verifierEvaluation = JSON.parse(verifyMatch[1].trim()); } catch { console.error("Failed to parse verifier evaluation"); }
    }

    const verifiedMatch = verifierOutput.match(/---VERIFIED_RESPONSE_START---\s*([\s\S]*?)\s*---VERIFIED_RESPONSE_END---/);
    if (verifiedMatch && verifiedMatch[1].trim().length > 50) {
      finalAnswer = verifiedMatch[1].trim();
      wasVerified = true;
    }

    // ── STEP 5: Stream the final response ──
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
        finalLength: postCriticAnswer.length,
      },
      verifier: {
        evaluation: verifierEvaluation,
        wasVerified,
        confidenceScore: verifierEvaluation?.confidence_score ?? null,
        confidenceLabel: verifierEvaluation?.confidence_label ?? null,
      },
    };

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const header = JSON.stringify(pipelineMetadata) + "\n---STREAM_START---\n";
        controller.enqueue(encoder.encode(header));

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
