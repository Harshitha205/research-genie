const INGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-url`;

export interface IngestedUrl {
  id: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  preview: string;
  sourceType: "url";
  sourceUrl: string;
}

export async function ingestUrl(url: string): Promise<IngestedUrl> {
  const resp = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Ingestion failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }

  return resp.json();
}
