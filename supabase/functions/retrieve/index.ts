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
    const { query, limit = 5 } = await req.json();
    if (!query) throw new Error("Query is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: chunks, error } = await supabase.rpc("search_chunks", {
      query_text: query,
      match_limit: limit,
    });

    if (error) throw new Error(`Search failed: ${error.message}`);

    const results = (chunks || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      sourceName: c.file_name,
      sourceType: c.source_type || "file",
      sourceUrl: c.source_url || null,
      sourceLocation: `Chunk ${c.chunk_index + 1}`,
      relevanceScore: c.rank,
    }));

    return new Response(JSON.stringify({
      query,
      totalResults: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("retrieve error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
