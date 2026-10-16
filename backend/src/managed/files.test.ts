import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, mkdir, utimes, rm, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { boundedDownload, cleanupExpired } from './files.js';
describe('managed temporary files', () => {
 it('streams valid input and removes partially written oversize input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const good = join(dir, 'good'); await boundedDownload(Readable.from([Buffer.from('hello')]), good, 5, new AbortController().signal);
   expect(await readFile(good, 'utf8')).toBe('hello');
   const bad = join(dir, 'bad'); await expect(boundedDownload(Readable.from([Buffer.alloc(3), Buffer.alloc(3)]), bad, 5, new AbortController().signal)).rejects.toThrow('size limit');
   expect(await readdir(dir)).toEqual(['good']);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('preserves an existing destination when exclusive creation fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const path = join(dir, 'existing'); await writeFile(path, 'saved video');
   const source = Readable.from([Buffer.from('replacement')]);
   await expect(boundedDownload(source, path, 100, new AbortController().signal)).rejects.toMatchObject({ code: 'EEXIST' });
   expect(await readFile(path, 'utf8')).toBe('saved video');
   expect(source.destroyed).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('preserves a destination symlink and its target', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const target = join(dir, 'target'); const path = join(dir, 'link');
   await writeFile(target, 'original'); await symlink(target, path);
   await expect(boundedDownload(Readable.from(['replacement']), path, 100, new AbortController().signal)).rejects.toMatchObject({ code: 'EEXIST' });
   expect(await readFile(path, 'utf8')).toBe('original');
   expect(await readFile(target, 'utf8')).toBe('original');
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('does not create a destination for an already cancelled download', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const controller = new AbortController(); controller.abort();
   const source = Readable.from(['input']);
   await expect(boundedDownload(source, join(dir, 'output'), 100, controller.signal)).rejects.toThrow();
   expect(await readdir(dir)).toEqual([]); expect(source.destroyed).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('removes its own partial destination after an input failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const source = Readable.from((async function* () { yield Buffer.from('partial'); throw Error('input failed'); })());
   await expect(boundedDownload(source, join(dir, 'output'), 100, new AbortController().signal)).rejects.toThrow('input failed');
   expect(await readdir(dir)).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('removes a partial download on cancellation after streaming begins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-'));
  try {
   const controller = new AbortController();
   const source = new Readable({ read() { this.push(Buffer.from('partial')); controller.abort(); } });
   await expect(boundedDownload(source, join(dir, 'output'), 100, controller.signal)).rejects.toThrow();
   expect(source.destroyed).toBe(true); expect(await readdir(dir)).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('expires only abandoned worker directories, preserving recent and unrelated files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'managed-test-')); const now = Date.now();
  try {
   for (const name of ['takeone-work-old', 'takeone-work-new', 'unrelated']) await mkdir(join(dir, name));
   await utimes(join(dir, 'takeone-work-old'), new Date(now - 7200000), new Date(now - 7200000));
   await cleanupExpired(dir, now); expect((await readdir(dir)).sort()).toEqual(['takeone-work-new', 'unrelated']);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
});
