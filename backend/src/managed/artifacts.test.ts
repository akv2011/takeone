import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bucket } from '@google-cloud/storage';
import { uploadArtifacts } from './artifacts.js';
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'artifact-test-')); await writeFile(join(dir, 'video'), 'real local bytes'); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
function storage(failKey?: string) {
 const objects = new Map<string, any>();
 const removed: string[] = []; const metadata = vi.fn(); const beforeDelete = vi.fn();
 let serial = 0;
 const bucket = { file(key: string, fileOptions?: any) { return {
  createWriteStream(options: any) {
   expect(options.preconditionOpts).toEqual({ ifGenerationMatch: 0 });
   return new Writable({ write(_chunk, _encoding, cb) { cb(); }, final(cb) {
    if (objects.has(key)) { cb(Error('collision')); return; }
    objects.set(key, { generation: String(++serial), metadata: options.metadata.metadata });
    cb(key === failKey ? Error('upload response lost') : undefined);
   } });
  },
  async getMetadata() { metadata(key); const value = objects.get(key); if (!value) throw Error('missing'); return [structuredClone(value)]; },
  async delete() {
   beforeDelete(key); const value = objects.get(key);
   if (value?.generation !== fileOptions?.preconditionOpts?.ifGenerationMatch) throw Error('generation changed');
   removed.push(key); objects.delete(key);
  },
 }; } } as unknown as Pick<Bucket, 'file'>;
 return { bucket, objects, removed, metadata, beforeDelete };
}
const bundle = () => ['video', 'clean', 'captions'].map(key => ({ key, path: join(dir, 'video'), contentType: 'video/mp4' }));
test('successful bundles retain all objects without cleanup reads', async () => {
 const s = storage(); await uploadArtifacts(s.bucket, bundle(), new AbortController().signal, vi.fn());
 expect(s.objects.size).toBe(3); expect(s.metadata).not.toHaveBeenCalled(); expect(s.removed).toEqual([]);
});
test('partial failure removes only attempted owned objects and preserves the original error', async () => {
 const s = storage('clean'), log = vi.fn();
 await expect(uploadArtifacts(s.bucket, bundle(), new AbortController().signal, log)).rejects.toThrow('upload response lost');
 expect(s.removed).toEqual(['video', 'clean']); expect(s.objects.size).toBe(0);
 expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'takeone.incomplete_upload_cleanup', removed: 2, preserved: 0, failed: 0 });
});
test('a collision cannot overwrite or delete an existing differently owned object', async () => {
 const s = storage(); s.objects.set('clean', { generation: '99', metadata: { takeoneUploadAttempt: 'other' } });
 await expect(uploadArtifacts(s.bucket, bundle(), new AbortController().signal, vi.fn())).rejects.toThrow('collision');
 expect(s.removed).toEqual(['video']); expect(s.objects.get('clean').generation).toBe('99');
});
test('generation precondition prevents deleting an object replaced after metadata inspection', async () => {
 const s = storage('clean'); s.beforeDelete.mockImplementation((key: string) => { s.objects.set(key, { generation: '999', metadata: {} }); });
 await expect(uploadArtifacts(s.bucket, bundle(), new AbortController().signal, vi.fn())).rejects.toThrow('upload response lost');
 expect(s.removed).toEqual([]); expect(s.objects.size).toBe(2);
});
test('metadata and logging failures do not mask the upload failure', async () => {
 const s = storage('clean'); s.metadata.mockImplementation(() => { throw Error('metadata unavailable'); });
 await expect(uploadArtifacts(s.bucket, bundle(), new AbortController().signal, () => { throw Error('logger failed'); })).rejects.toThrow('upload response lost');
 expect(s.removed).toEqual([]);
});
test('pre-aborted jobs never attempt a cloud write', async () => {
 const s = storage(), controller = new AbortController(); controller.abort();
 await expect(uploadArtifacts(s.bucket, bundle(), controller.signal, vi.fn())).rejects.toThrow();
 expect(s.objects.size).toBe(0); expect(s.metadata).not.toHaveBeenCalled();
});
