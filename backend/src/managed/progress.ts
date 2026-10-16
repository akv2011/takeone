/** Safe stage identifiers only. Keep in sync with convex/renderProgress.ts. */
export type RenderStage = 'script' | 'narration' | 'footage' | 'moments' | 'source' | 'transcription' | 'cut' | 'finishing' | 'checking' | 'saving';
export type ReportProgress = (stage: RenderStage) => Promise<void>;

/** Progress transport failure cannot discard a good render. Lease rejection still stops work. */
export function progressReporter(send: (stage: RenderStage) => Promise<boolean>, signal: AbortSignal): ReportProgress {
  return async stage => {
    signal.throwIfAborted();
    let accepted: boolean;
    try { accepted = await send(stage); }
    catch { signal.throwIfAborted(); return; }
    signal.throwIfAborted();
    if (!accepted) throw Error('Render lease lost');
  };
}
