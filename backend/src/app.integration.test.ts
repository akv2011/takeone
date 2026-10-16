// A5 integration — the REAL pipeline end-to-end (real media-core + ingest + content + prepare).
// Mode 2 (edit) and Mode 1 (generate) both run fully offline here (generate uses macOS `say`
// + a gradient b-roll). Mode 3 (clip) needs yt-dlp installed, so it's covered in ingest tests.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { createTakeOne } from './app.js';
import { cleanupOutput } from './queue/index.js';

const SAMPLE = resolve(process.cwd(), 'fixtures/sample.mp4');
function probe(path: string): Promise<{ w: number; h: number; audio: boolean }> {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', path]);
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('close', () => { try { const s = JSON.parse(out).streams ?? []; const v = s.find((x: any) => x.codec_type === 'video'); res({ w: v?.width ?? 0, h: v?.height ?? 0, audio: s.some((x: any) => x.codec_type === 'audio') }); } catch (e) { rej(e as Error); } });
  });
}

describe('A5 integration — real pipeline', () => {
  it('Mode 2 (edit): "make it vertical with a watermark" -> real 9:16 video', async () => {
    const takeone = createTakeOne();   // real media-core + prepare
    const replies = await takeone.handle({ userId: 'itest', platform: 'telegram', text: 'make it vertical with a watermark', attachmentPath: SAMPLE, isPro: false });
    expect(replies[0].kind).toBe('file');
    const file = (replies[0] as any).filePath as string;
    const p = await probe(file);
    expect(p.w).toBe(1080); expect(p.h).toBe(1920);
    await cleanupOutput(file);
  }, 40000);

  it('Mode 1 (generate): topic -> a 9:16 reel with voiceover audio (offline)', async () => {
    const takeone = createTakeOne();
    const replies = await takeone.handle({ userId: 'gen1', platform: 'telegram', text: 'why UPI beat credit cards in india', isPro: false });
    expect(replies[0].kind).toBe('file');
    const file = (replies[0] as any).filePath as string;
    const p = await probe(file);
    expect(p.w).toBe(1080); expect(p.h).toBe(1920); expect(p.audio).toBe(true);
    await cleanupOutput(file);
  }, 60000);

  it('free-tier: 4th job in a day is blocked with an upsell', async () => {
    const takeone = createTakeOne({ freeDailyLimit: 3 });
    const send = () => takeone.handle({ userId: 'capuser', platform: 'telegram', text: 'caption it', attachmentPath: SAMPLE, isPro: false });
    for (let i = 0; i < 3; i++) { const r = await send(); if (r[0].kind === 'file') await cleanupOutput((r[0] as any).filePath); }
    const blocked = await send();
    expect(blocked[0].kind).toBe('text');
    expect((blocked[0] as any).text).toMatch(/free reels|pro/i);
  }, 120000);   // 3 real renders back-to-back — needs headroom on a 2-vCPU VPS
});
