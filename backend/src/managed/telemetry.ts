import { randomUUID } from 'node:crypto';
/** Operational timings contain IDs and stage names, never prompts, URLs or credentials. */
export function telemetry(jobId: string, log: (line: string) => void) {
  const runId = randomUUID();
  const emit = (fields: Record<string, unknown>) => {
    try { log(JSON.stringify({ event: 'takeone.stage', jobId, runId, at: new Date().toISOString(), ...fields })); }
    catch { /* Monitoring must not change job outcomes. */ }
  };
  return {
    emit,
    async time<T>(stage: string, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      let success = false;
      try { const result = await operation(); success = true; return result; }
      finally { emit({ stage, success, durationMs: Math.max(0, Math.round(performance.now() - start)) }); }
    },
  };
}
