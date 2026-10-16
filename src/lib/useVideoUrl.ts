import { useCallback, useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from './convexApi';

// Refresh before the short-lived GCS URL expires, and when the browser resumes.
export function useVideoUrl(jobId?: string, hasOutput?: boolean, legacyUrl?: string | null) {
  const sequence = useRef(0);
  const sign = useAction(api.generate.getDownload);
  const [value, setValue] = useState<{ jobId?: string; url?: string; error?: string }>({});
  const refresh = useCallback(async () => {
    if (!jobId || !hasOutput) return;
    const request = ++sequence.current;
    try {
      const result = await sign({ jobId }) as { url: string };
      if (!result.url.startsWith('https://')) throw new Error('Invalid download URL');
      if (request === sequence.current) setValue({ jobId, url: result.url });
    } catch { if (request === sequence.current) setValue({ jobId, error: 'Video link unavailable. Try refreshing.' }); }
  }, [jobId, hasOutput, sign]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5 * 60_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, invalidate]);
  return { url: hasOutput ? (value.jobId === jobId ? value.url : undefined) : legacyUrl ?? undefined,
    error: value.jobId === jobId ? value.error : undefined, refresh };
}
