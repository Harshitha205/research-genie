export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface RetrievedSource {
  index: number;
  sourceName: string;
  sourceType: "file" | "url";
  sourceUrl: string | null;
  location: string;
  relevance: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  onSources,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  onSources: (sources: RetrievedSource[]) => void;
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

      // Parse source metadata header first
      if (!sourcesParsed) {
        const streamStartIdx = buffer.indexOf("---STREAM_START---\n");
        if (streamStartIdx !== -1) {
          const headerPart = buffer.slice(0, streamStartIdx);
          buffer = buffer.slice(streamStartIdx + "---STREAM_START---\n".length);
          sourcesParsed = true;
          try {
            const parsed = JSON.parse(headerPart.trim());
            if (parsed.retrievedSources) {
              onSources(parsed.retrievedSources);
            }
          } catch { /* ignore parse errors */ }
        } else {
          continue; // Wait for more data
        }
      }

      // Process SSE lines
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

    // Flush remaining
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
