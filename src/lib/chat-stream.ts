export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface RetrievedSource {
  index: number;
  sourceName: string;
  sourceType: "file" | "url";
  sourceUrl: string | null;
  location: string;
  relevance: number;
}

export interface PipelineInfo {
  query: string;
  chunksRetrieved: number;
  hasContext: boolean;
}

export interface CriticEvaluation {
  issues_found: boolean;
  evaluation: {
    logical_consistency: { score: number; note: string };
    answers_question: { score: number; note: string };
    clarity: { score: number; note: string };
    completeness: { score: number; note: string };
    citation_accuracy: { score: number; note: string };
  };
  overall_score: number;
  summary: string;
}

export interface CriticInfo {
  evaluation: CriticEvaluation | null;
  wasImproved: boolean;
  originalLength: number;
  finalLength: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  onSources,
  onPipeline,
  onCritic,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  onSources: (sources: RetrievedSource[]) => void;
  onPipeline: (info: PipelineInfo) => void;
  onCritic: (info: CriticInfo) => void;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Unknown error" }));
      onError(err.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) { onError("No response body"); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    let sourcesParsed = false;

    while (!done) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });

      if (!sourcesParsed) {
        const streamStartIdx = buffer.indexOf("---STREAM_START---\n");
        if (streamStartIdx !== -1) {
          const headerPart = buffer.slice(0, streamStartIdx);
          buffer = buffer.slice(streamStartIdx + "---STREAM_START---\n".length);
          sourcesParsed = true;
          try {
            const parsed = JSON.parse(headerPart.trim());
            if (parsed.retrievedSources) onSources(parsed.retrievedSources);
            if (parsed.pipeline) onPipeline(parsed.pipeline);
            if (parsed.critic) onCritic(parsed.critic);
          } catch { /* ignore */ }
        } else {
          continue;
        }
      }

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6).trim();
        if (json === "[DONE]") { done = true; break; }

        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const json = raw.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Connection failed");
  }
}
