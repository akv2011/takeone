import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function summarize(records) {
  const stages = new Map(), outcomes = {}, seen = new Set();
  let ignored = 0;
  for (const row of records) {
    let event = row?.jsonPayload ?? row;
    if (row?.textPayload) { try { event = JSON.parse(row.textPayload); } catch { ignored++; continue; } }
    if (!event || !['takeone.stage', 'takeone.queue_wait', 'takeone.outcome'].includes(event.event)) { ignored++; continue; }
    const identity = JSON.stringify(event);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (event.event === 'takeone.outcome') {
      if (['skipped', 'lost', 'completed', 'failed', 'interrupted', 'finalize_uncertain'].includes(event.outcome)) outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      continue;
    }
    if (!Number.isFinite(event.durationMs) || event.durationMs < 0) { ignored++; continue; }
    const name = event.event === 'takeone.queue_wait' ? 'initial_queue_wait' : event.stage;
    if (!['initial_queue_wait', 'claim', 'render', 'upload', 'finalize', 'post_completion_hook', 'cleanup', 'telegram_api_delivery', 'telegram_after_render', 'telegram_total'].includes(name)) { ignored++; continue; }
    const values = stages.get(name) ?? { success: [], failures: 0 };
    if (event.event === 'takeone.queue_wait' || event.success === true) values.success.push(event.durationMs);
    else values.failures++;
    stages.set(name, values);
  }
  const percent = (values, p) => values.length ? values[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
  return {
    scope: 'Successful stage latency only. Initial queue wait is measured at first claim. Telegram stages measure Bot API acceptance, not device receipt or viewing. telegram_total starts at job creation and includes queue/render/retries. Post-completion hook is not Telegram delivery latency. Combine worker and Convex log exports for all stages.',
    stages: Object.fromEntries([...stages].map(([name, values]) => {
      const sorted = values.success.sort((a, b) => a - b);
      return [name, { successfulSamples: sorted.length, failedSamples: values.failures, p50Ms: percent(sorted, 0.5), p95Ms: percent(sorted, 0.95), maxMs: sorted.at(-1) ?? null }];
    })), outcomes, ignoredRecords: ignored,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/summarize-latency.mjs exported-cloud-logs.json');
  const raw = await readFile(process.argv[2], 'utf8');
  const records = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter(line => line.trim()).map(line => { try { return JSON.parse(line); } catch { return null; } });
  if (!Array.isArray(records)) throw new Error('Expected a JSON array or JSONL export');
  console.log(JSON.stringify(summarize(records), null, 2));
}
