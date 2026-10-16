import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { ingest, ytdlpArgs, IngestError } from './index.js';

const SAMPLE = resolve(process.cwd(), 'fixtures/sample.mp4');
const LIMITS = { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: 120 };

describe('ingest', () => {
  it('ytdlpArgs builds a segment-only download', () => {
    const a = ytdlpArgs('https://youtu.be/x', '*2:30-3:15', '/tmp/o.mp4');
    expect(a).toContain('--download-sections');
    expect(a).toContain('*2:30-3:15');
    expect(a[a.length - 1]).toBe('https://youtu.be/x');
  });
  it('probe returns real meta for the sample', async () => {
    const m = await ingest.probe(SAMPLE);
    expect(m.hasVideo).toBe(true); expect(m.width).toBeGreaterThan(0); expect(m.bytes).toBeGreaterThan(0);
  });
  it('upload ingest validates and returns the path', async () => {
    const { path, meta } = await ingest.ingest({ kind: 'upload', path: SAMPLE }, LIMITS);
    expect(path).toBe(SAMPLE); expect(meta.hasVideo).toBe(true);
  });
  it('rejects an oversize file', async () => {
    await expect(ingest.ingest({ kind: 'upload', path: SAMPLE }, { ...LIMITS, maxBytes: 100 }))
      .rejects.toBeInstanceOf(IngestError);
  });
  it('rejects a too-long file', async () => {
    await expect(ingest.ingest({ kind: 'upload', path: SAMPLE }, { ...LIMITS, maxDurationSec: 2 }))
      .rejects.toBeInstanceOf(IngestError);
  });
  it('none source returns an empty passthrough', async () => {
    const r = await ingest.ingest({ kind: 'none' }, LIMITS);
    expect(r.path).toBe('');
  });

});
