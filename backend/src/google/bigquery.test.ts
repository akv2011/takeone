import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } } }));
import { insertAnalyticsRow } from './bigquery.js';

const row = { version_id: 'secretVersion42', note_count: 7, sentiment: 'mixed' } as const;
beforeEach(() => { vi.stubEnv('BIGQUERY_PROJECT', 'test-project'); vi.stubEnv('BIGQUERY_DATASET', 'takeone_analytics'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('streams one row to tabledata.insertAll with a UTC created_at and no insertId', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-17T09:08:07.654Z'));
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ kind: 'bigquery#tableDataInsertAllResponse' })); vi.stubGlobal('fetch', fetcher);
  expect(await insertAnalyticsRow('feedback', row)).toBe(true);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://bigquery.googleapis.com/bigquery/v2/projects/test-project/datasets/takeone_analytics/tables/feedback/insertAll');
  expect(init.method).toBe('POST');
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-token');
  expect(JSON.parse(init.body as string)).toEqual({ rows: [{ json: { version_id: 'secretVersion42', note_count: 7, sentiment: 'mixed', created_at: '2026-10-17 09:08:07' } }] });
});

it('does nothing when analytics is not configured', async () => {
  vi.stubEnv('BIGQUERY_PROJECT', ''); vi.stubEnv('BIGQUERY_DATASET', '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const log = vi.fn();
  expect(await insertAnalyticsRow('feedback', row, log)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
});

it.each([
  ['BIGQUERY_DATASET', ''],
  ['BIGQUERY_PROJECT', ''],
  ['BIGQUERY_DATASET', 'bad-dataset'],
  ['BIGQUERY_PROJECT', 'Bad_Project'],
])('logs and skips the insert when %s is %j', async (name, value) => {
  vi.stubEnv(name, value);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const log = vi.fn();
  expect(await insertAnalyticsRow('feedback', row, log)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'takeone.analytics_failed', table: 'feedback', failure: 'config' });
});

it('treats a 200 with insertErrors as a failure and logs without row values', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ insertErrors: [{ index: 0, errors: [{ reason: 'invalid', message: 'secretVersion42 bad' }] }] })));
  const log = vi.fn();
  expect(await insertAnalyticsRow('feedback', row, log)).toBe(false);
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'takeone.analytics_failed', table: 'feedback', failure: 'insert_errors' });
  expect(log.mock.calls.join('\n')).not.toMatch(/secretVersion42|mixed/);
});

it('a rejected fetch returns false without throwing, even with a broken logger', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw Error('socket hang up secretVersion42'); }));
  const log = vi.fn();
  expect(await insertAnalyticsRow('feedback', row, log)).toBe(false);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ failure: 'request' });
  expect(log.mock.calls.join('\n')).not.toContain('secretVersion42');
  expect(await insertAnalyticsRow('feedback', row, () => { throw Error('logger offline'); })).toBe(false);
});
