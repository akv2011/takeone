import { FieldValue, Firestore } from '@google-cloud/firestore';
import type { RenderStage } from './progress.js';

export interface MirrorClient {
  doc(path: string): { set(data: Record<string, unknown>, options: { merge: true }): Promise<unknown> };
  terminate(): Promise<void>;
}
export interface RenderMirror {
  stage(jobId: string, stage: RenderStage): void;
  status(jobId: string, status: 'done' | 'failed'): void;
  close(): Promise<void>;
}

/** Best-effort copy of render progress in Firestore `renders/{jobId}`. Convex stays the source of
 * truth: writes run in order behind the Convex report, each bounded by `timeoutMs`, and a failure
 * only logs. */
export function renderMirror(projectId: string | undefined, log: (event: string) => void,
  connect: (projectId: string) => MirrorClient = id => new Firestore({ projectId: id }), timeoutMs = 3_000): RenderMirror {
  const client = projectId ? connect(projectId) : undefined;
  let tail = Promise.resolve();
  const write = (jobId: string, data: Record<string, unknown>) => {
    if (!client) return;
    tail = tail.then(async () => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), timeoutMs); });
      try { await Promise.race([client.doc(`renders/${jobId}`).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), timeout]); }
      finally { clearTimeout(timer); }
    }).catch(() => log('firestore_progress_failed'));
  };
  return {
    stage: (jobId, stage) => write(jobId, { stage, stages: FieldValue.arrayUnion(stage) }),
    status: (jobId, status) => write(jobId, { status }),
    async close() { await tail; await client?.terminate().catch(() => {}); },
  };
}
