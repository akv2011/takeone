export class RequestBodyError extends Error {
  constructor(public readonly status: 400 | 408 | 413, message: string) { super(message); }
}

/** Retains at most maxBytes, regardless of content-length or chunk boundaries. */
export async function readRequestText(req: Request, maxBytes: number, timeoutMs = 10_000): Promise<string> {
  const declared = req.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    void req.body?.cancel().catch(() => {});
    throw new RequestBodyError(413, 'Too large');
  }
  if (!req.body) return '';
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestBodyError(408, 'Request body timed out')), timeoutMs);
  });
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (size + value.byteLength > maxBytes) throw new RequestBodyError(413, 'Too large');
      bytes.set(value, size);
      size += value.byteLength;
    }
    // Preserve the exact UTF-8 text, including a leading BOM, for signatures.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size));
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, 'Invalid request body');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
