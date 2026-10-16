import { FieldValue } from '@google-cloud/firestore';
import { expect, test, vi } from 'vitest';
import { renderMirror, type MirrorClient } from './firestoreProgress.js';

function fakeClient(set: (data: Record<string, unknown>) => Promise<unknown>) {
  const paths: string[] = [], options: unknown[] = [];
  const client: MirrorClient = { doc: path => { paths.push(path); return { set: (data, option) => { options.push(option); return set(data); } }; }, terminate: vi.fn(async () => {}) };
  return { client, paths, options };
}

test('writes the stage, the stage history and a server timestamp to renders/{jobId}, then the outcome', async () => {
  const writes: Record<string, unknown>[] = [];
  const { client, paths, options } = fakeClient(async data => { writes.push(data); });
  const connect = vi.fn(() => client);
  const mirror = renderMirror('test-project', vi.fn(), connect);
  mirror.stage('job1', 'source'); mirror.stage('job1', 'cut'); mirror.status('job1', 'done');
  await mirror.close();
  expect(connect).toHaveBeenCalledWith('test-project');
  expect(paths).toEqual(['renders/job1', 'renders/job1', 'renders/job1']);
  expect(options).toEqual([{ merge: true }, { merge: true }, { merge: true }]);
  expect(writes).toEqual([
    { stage: 'source', stages: FieldValue.arrayUnion('source'), updatedAt: FieldValue.serverTimestamp() },
    { stage: 'cut', stages: FieldValue.arrayUnion('cut'), updatedAt: FieldValue.serverTimestamp() },
    { status: 'done', updatedAt: FieldValue.serverTimestamp() },
  ]);
  expect(client.terminate).toHaveBeenCalledOnce();
});

test('a hung write times out, logs, and later writes still run', async () => {
  const log = vi.fn(), writes: unknown[] = [];
  let first = true;
  const { client } = fakeClient(data => { if (first) { first = false; return new Promise(() => {}); } writes.push(data.status); return Promise.resolve(); });
  const mirror = renderMirror('test-project', log, () => client, 20);
  const started = Date.now();
  mirror.stage('job1', 'source'); mirror.status('job1', 'failed');
  await mirror.close();
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(log).toHaveBeenCalledWith('firestore_progress_failed');
  expect(writes).toEqual(['failed']);
});

test('a failing write never throws to the caller', async () => {
  const log = vi.fn();
  const { client } = fakeClient(async () => { throw Error('PERMISSION_DENIED'); });
  const mirror = renderMirror('test-project', log, () => client);
  expect(() => mirror.stage('job1', 'source')).not.toThrow();
  await expect(mirror.close()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith('firestore_progress_failed');
});

test('an unset project never connects or writes', async () => {
  const connect = vi.fn();
  const mirror = renderMirror(undefined, vi.fn(), connect);
  mirror.stage('job1', 'source'); mirror.status('job1', 'done');
  await mirror.close();
  expect(connect).not.toHaveBeenCalled();
});
