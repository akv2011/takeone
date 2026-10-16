import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ff, ffprobe } from './ffmpeg.js';
import { restyleCaptionArchive } from './captionRestyle.js';
import { mediaCore } from './index.js';
import { replaceSceneVideo } from './sceneReplacement.js';
import type { SavedScenePlan } from '../types.js';
const exec = promisify(execFile), dirs: string[] = [];
const plan: SavedScenePlan = { version: 1, durationSec: 6, scenes: Array.from({ length: 3 }, (_, i) => ({ startSec: i*2, endSec: (i+1)*2, purpose: 'Scene', searchTerms: ['source'], shotType: 'wide', motion: 'still' })) };
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const audio = async (path: string) => (await exec('ffmpeg', ['-v','error','-i',path,'-map','0:a','-c:a','pcm_s16le','-f','hash','-hash','sha256','-'])).stdout;
const frame = async (path: string, at: number) => (await exec('ffmpeg', ['-v','error','-ss',String(at),'-i',path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'], { encoding: 'buffer', maxBuffer: 1024*1024 })).stdout;
test('real replacement changes only the chosen scene, preserves full decoded audio and fully decodes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scene-swap-')); dirs.push(dir);
  const source = join(dir,'source.mp4'), replacement = join(dir,'new.mp4'), output = join(dir,'out.mp4');
  await ff(['-f','lavfi','-i','color=red:s=160x90:r=30:d=2','-f','lavfi','-i','color=green:s=160x90:r=30:d=2','-f','lavfi','-i','color=blue:s=160x90:r=30:d=2','-f','lavfi','-i','sine=frequency=440:duration=6','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]','-map','3:a','-c:v','libx264','-threads','2','-c:a','aac',source]);
  await ff(['-f','lavfi','-i','color=yellow:s=240x160:r=30:d=2','-c:v','libx264','-threads','2',replacement]);
  await replaceSceneVideo(source,replacement,output,plan,1,new AbortController().signal);
  expect(await audio(output)).toBe(await audio(source));
  for (const at of [1,5]) {
    const before=await frame(source,at), after=await frame(output,at);
    expect(before.length).toBe(after.length);
    expect(before.reduce((sum,value,i)=>sum+Math.abs(value-after[i]),0)/before.length).toBeLessThan(1);
  }
  const before=await frame(source,3), after=await frame(output,3);
  expect(before.reduce((sum,value,i)=>sum+Math.abs(value-after[i]),0)/before.length).toBeGreaterThan(30);
  expect((await ffprobe(output)).durationSec).toBeCloseTo(6,1);
  await ff(['-i',output,'-f','null','-']);
  const supportsCaptions = (await exec('ffmpeg', ['-filters'])).stdout.includes(' subtitles ');
  if (supportsCaptions) {
  const captionDir=join(dir,'captioned');await mkdir(captionDir);
  const raw=JSON.stringify({version:1,style:'clean',cues:[{start:0,end:6,text:'Original caption words'}]});
  const captioned=await restyleCaptionArchive(output,raw,'clean',{tmpDir:captionDir,isPro:true,strictMedia:true,signal:new AbortController().signal},mediaCore.runOp,'top','serif');
  expect(await audio(captioned)).toBe(await audio(source));
  const originalCaptionDir=join(dir,'original-captioned');await mkdir(originalCaptionDir);
  const originalCaptioned=await restyleCaptionArchive(source,raw,'clean',{tmpDir:originalCaptionDir,isPro:true,strictMedia:true,signal:new AbortController().signal},mediaCore.runOp,'top','serif');
  for (const at of [1,5]) { const original=await frame(originalCaptioned,at), edited=await frame(captioned,at); expect(original.reduce((sum,value,i)=>sum+Math.abs(value-edited[i]),0)/original.length).toBeLessThan(1); }
  await ff(['-i',captioned,'-f','null','-']);
  }
  const audioTail=join(dir,'audio-tail.mp4');
  await ff(['-f','lavfi','-i','color=yellow:s=160x90:r=30:d=1','-f','lavfi','-i','sine=frequency=880:duration=4','-c:v','libx264','-threads','2','-c:a','aac',audioTail]);
  expect((await ffprobe(audioTail)).durationSec).toBeGreaterThan(3);
  const longScenePlan = {...plan, scenes: [{...plan.scenes[0],startSec:0,endSec:3},{...plan.scenes[1],startSec:3,endSec:6}]};
  await expect(replaceSceneVideo(source,audioTail,join(dir,'audio-tail-out.mp4'),longScenePlan,0,new AbortController().signal)).rejects.toThrow('too short');
  const short=join(dir,'short.mp4');await ff(['-i',replacement,'-t','0.5','-c','copy',short]);
  await expect(replaceSceneVideo(source,short,join(dir,'too-short.mp4'),plan,1,new AbortController().signal)).rejects.toThrow('too short');
  await expect(replaceSceneVideo(source,replacement,join(dir,'invalid.mp4'),plan,9,new AbortController().signal)).rejects.toThrow('Invalid');
  const controller=new AbortController();controller.abort();
  await expect(replaceSceneVideo(source,replacement,join(dir,'aborted.mp4'),plan,1,controller.signal)).rejects.toThrow();
},180000);
