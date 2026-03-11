const PROCESS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`;

export interface ProcessedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  preview: string;
}

export async function processDocument(file: File): Promise<ProcessedDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const resp = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Processing failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }

  return resp.json();
}
