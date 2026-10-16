import type { Sentiment } from '../managed/feedback.js';
import { googleJson, PROJECT_ID } from './auth.js';

export interface AnalyticsRows {
  renders: { job_id: string; mode: string; caption_language: string | null; stage_timings: Array<{ stage: string; duration_ms: number }>; total_seconds: number | null; outcome: string };
  feedback: { version_id: string; note_count: number; sentiment: Sentiment };
}

/** Best effort. True when BigQuery accepted the row, false when analytics is off or the insert failed. Never throws. */
export async function insertAnalyticsRow<T extends keyof AnalyticsRows>(table: T, row: AnalyticsRows[T], log: (event: string) => void = () => {}): Promise<boolean> {
  const project = process.env.BIGQUERY_PROJECT?.trim(), dataset = process.env.BIGQUERY_DATASET?.trim();
  if (!project && !dataset) return false;
  const failed = (failure: string) => {
    try { log(JSON.stringify({ event: 'takeone.analytics_failed', table, failure })); } catch { /* A broken logger must not throw out of a best-effort write. */ }
    return false;
  };
  if (!project || !dataset || !PROJECT_ID.test(project) || !/^[A-Za-z0-9_]{1,1024}$/.test(dataset)) return failed('config');
  try {
    const created_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result = await googleJson('BigQuery', `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets/${dataset}/tables/${table}/insertAll`,
      { json: { rows: [{ json: { ...row, created_at } }] }, timeoutMs: 5_000 });
    return Array.isArray(result?.insertErrors) && result.insertErrors.length ? failed('insert_errors') : true;
  } catch { return failed('request'); }
}
