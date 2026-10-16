import { describe, it, expect } from 'vitest';
import { route, ClarifyError, ImpossibleError } from './index.js';
import type { ChatCtx } from '../types.js';

const ctx = (over: Partial<ChatCtx> = {}): ChatCtx =>
  ({ userId: 'u1', platform: 'telegram', isPro: false, ...over });

describe('router: NL -> JobSpec', () => {
  it('1. edit: attachment + "add subtitles" -> edit/upload with captions', async () => {
    const j = await route('add subtitles', ctx({ attachmentPath: '/tmp/x.mp4' }));
    expect(j.mode).toBe('edit');
    expect(j.source.kind).toBe('upload');
    expect(j.ops.some(o => o.op === 'captions')).toBe(true);
  });

  it('2. clip: youtube link + range -> sections cut at download, NO second trim op', async () => {
    const j = await route('clip this https://youtu.be/aqz-KE-bpKQ from 2:30 to 3:15', ctx());
    expect(j.mode).toBe('clip');
    expect(j.source.kind).toBe('youtube');
    expect(j.source.sections).toBe('*2:30-3:15');
    // the section file starts at 0 — an absolute-time clip op would seek past its end
    expect(j.ops.find(o => o.op === 'clip')).toBeUndefined();
  });

  it('2b. clip: dot-style timestamps ("1.10 to 1.30") normalize to colons', async () => {
    const j = await route('https://youtu.be/aqz-KE-bpKQ 1.10 to 1.30', ctx());
    expect(j.mode).toBe('clip');
    expect(j.source.sections).toBe('*1:10-1:30');
  });

  it('2c. a "1:1x" timestamp must NOT trigger the 1:1 aspect (regex boundary bug)', async () => {
    const j = await route('clip https://youtu.be/aqz-KE-bpKQ 1:10 to 1:25', ctx());
    expect(j.ops.find(o => o.op === 'format')).toMatchObject({ aspect: '9:16' });
    const sq = await route('clip https://youtu.be/aqz-KE-bpKQ 2:30 to 2:45 square', ctx());
    expect(sq.ops.find(o => o.op === 'format')).toMatchObject({ aspect: '1:1' });
  });

  it('3. generate: topic only -> generate/none carrying the topic', async () => {
    const j = await route('why UPI beat credit cards in india', ctx());
    expect(j.mode).toBe('generate');
    expect(j.source.kind).toBe('none');
    expect(j.source.topic).toContain('UPI');
    expect(j.ops.some(o => o.op === 'captions' && o.source === 'script')).toBe(true);
  });

  it('4. YouTube link with no timestamp -> ClarifyError', async () => {
    await expect(route('make a short from https://youtu.be/aqz-KE-bpKQ', ctx()))
      .rejects.toBeInstanceOf(ClarifyError);
  });

  it('5. impossible chain: "to mp3 and add captions" -> ImpossibleError', async () => {
    await expect(route('convert to mp3 and add captions', ctx({ attachmentPath: '/tmp/x.mp4' })))
      .rejects.toBeInstanceOf(ImpossibleError);
  });

  it('6. vague no-source -> ClarifyError', async () => {
    await expect(route('make it better', ctx())).rejects.toBeInstanceOf(ClarifyError);
  });

  it('watermark shows for free, hidden for pro', async () => {
    const free = await route('caption it', ctx({ attachmentPath: '/tmp/x.mp4' }));
    const pro = await route('caption it', ctx({ attachmentPath: '/tmp/x.mp4', isPro: true }));
    expect(free.ops.find(o => o.op === 'watermark')).toMatchObject({ show: true });
    expect(pro.ops.find(o => o.op === 'watermark')).toMatchObject({ show: false });
  });
});

it('studio trim/speed instruction preserves range and does not add new captions', async () => {
 const job = await route('Trim 01:05 to 01:15 and speed 2x', ctx({ mode: 'edit', attachmentPath: '/tmp/source.mp4' }));
 expect(job.ops.slice(0, 2)).toEqual([{ op: 'trim', start: '01:05', end: '01:15' }, { op: 'speed', factor: 2 }]);
 expect(job.ops.some(op => op.op === 'captions')).toBe(false);
});

it('fractional Studio cuts retain seconds instead of turning decimals into hours', async () => {
 const job = await route('Trim 01:05.125 to 01:15.375 and speed 0.5x', ctx({ mode: 'edit', attachmentPath: '/tmp/source.mp4' }));
 expect(job.ops.slice(0, 2)).toEqual([{ op: 'trim', start: '01:05.125', end: '01:15.375' }, { op: 'speed', factor: 0.5 }]);
 const clip = await route('https://youtu.be/aqz-KE-bpKQ 0:01.125 to 0:02.375', ctx());
 expect(clip.source.sections).toBe('*0:01.125-0:02.375');
});

it('explicit decimal and multiplication-sign speed preserve the value', async () => {
 for (const text of ['speed 3x','speed 3×','3×','speed 1.5x']) { const job=await route(text,ctx({mode:'edit',attachmentPath:'/tmp/source.mp4'})); expect(job.ops).toContainEqual({op:'speed',factor:text.includes('1.5')?1.5:3}); }
});
it('malformed and unsupported numeric speeds reject instead of falling back', async () => {
 for(const text of ['speed -3x','speed 1e3x','13x','speed 3.1x','speed 3..0x']) await expect(route(text,ctx({mode:'edit',attachmentPath:'/tmp/source.mp4'}))).rejects.toThrow();
});
