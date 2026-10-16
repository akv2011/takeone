set -eu
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=320x240:r=10 -f lavfi -i sine=frequency=440 -t 1 -c:v libx264 -c:a aac /tmp/input.mp4
ffmpeg -hide_banner -loglevel error -i /tmp/input.mp4 -vn /tmp/track.wav
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=red:s=320x240:r=10 -t 1 -c:v libx264 /tmp/stock.mp4
ffmpeg -hide_banner -loglevel error -stream_loop -1 -i /tmp/input.mp4 -t 5 -c copy /tmp/cutaway-source.mp4
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=red:s=100x100:r=10 -t 2 /tmp/sticker.gif
test -f dist/managed/run.js
yt-dlp --version
espeak-ng --version
SMART_CROP=0 node --input-type=module <<'JS'
import { createTakeOne } from './dist/app.js';
import { applyEditPlan } from './dist/gateway/index.js';
import { mediaCore } from './dist/media/index.js';
import { ffprobe } from './dist/media/ffmpeg.js';
import { prepareDelivery } from './dist/media/delivery.js';
import { archiveCaptionLayer } from './dist/media/captionArchive.js';
import { transformCaptionArchive } from './dist/media/captionTransform.js';
import { restyleCaptionArchive, replaceCaptionTexts } from './dist/media/captionRestyle.js';
import { createExecutor } from './dist/queue/index.js';
import { DEFAULT_LIMITS } from './dist/types.js';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, chmod, copyFile } from 'node:fs/promises';
import { downloadSoundtrack } from './dist/managed/soundtrack.js';
import { ingest } from './dist/ingest/index.js';
import { renderAssembly } from './dist/media/assembly.js';
import { setTimeout as delay } from 'node:timers/promises';
import { Readable } from 'node:stream';
const app = createTakeOne({ executor: { maxConcurrent: 1, outDir: '/tmp/smoke-out' } });
const replies = await app.handle({ userId: 'smoke', platform: 'cli', text: 'make it square', attachmentPath: '/tmp/input.mp4', isPro: false });
const result = replies.find(r => r.kind === 'file');
if (!result) throw new Error('No output: ' + JSON.stringify(replies));
const meta = await ffprobe(result.filePath);
if (meta.width !== meta.height || !meta.hasAudio || !meta.hasVideo || meta.durationSec < 0.9) throw new Error('Invalid output: ' + JSON.stringify(meta));
for (const style of ['clean', 'meme', 'karaoke']) {
  const captioned = await mediaCore.runOp(result.filePath, { op: 'captions', source: 'script', style, cues: [{ start: 0, end: 1, text: style === 'meme' ? 'CONTAINER CAPTION CHECK' : 'Container caption check' }] }, { tmpDir: '/tmp', isPro: true, strictMedia: true });
  await prepareDelivery(captioned.outputPath, `/tmp/delivery-${style}.mp4`, { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
  console.log(`Strict caption render and decode passed: ${style}`);
}
console.log('Linux container real-media smoke passed', JSON.stringify(meta));
await mkdir('/tmp/assembly-smoke', { recursive: true });
const assemblyJob = { kind: 'job', jobId: 'smokejob' }, assemblyUpload = { kind: 'upload', uploadId: 'smokeupload' };
const assemblyInput = await readFile('/tmp/input.mp4'), assemblyStock = await readFile('/tmp/stock.mp4');
const assemblyOutput = await renderAssembly({ profile: { container: 'mp4', fps: 30 }, timeline: { version: 1, aspect: '9:16', durationMs: 2500,
  video: [
    { id: 'one', source: assemblyJob, sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0, fit: 'crop', muted: false },
    { id: 'two', source: assemblyUpload, sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 1000, fit: 'fit', muted: false },
    { id: 'three', source: assemblyJob, sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 1500, fit: 'crop', muted: false },
  ], transitions: [{ id: 'overlap', fromClipId: 'two', toClipId: 'three', type: 'fade', durationMs: 500 }], text: [], graphics: [] } }, [
  { source: assemblyJob, storageKey: 'videos/smokejob/lease.mp4', durationMs: 1000, width: 320, height: 240, hasAudio: true },
  { source: assemblyUpload, storageUrl: 'https://smoke.convex.cloud/api/storage/fixture', durationMs: 1000, width: 320, height: 240, hasAudio: false },
], '/tmp/assembly-smoke/render.mp4', '/tmp/assembly-smoke', {
  bucket: { file: () => ({ createReadStream: () => Readable.from(assemblyInput) }) }, convexUrl: 'https://smoke.convex.cloud',
  fetch: async () => new Response(assemblyStock),
}, new AbortController().signal);
const checkedAssembly = await prepareDelivery(assemblyOutput, '/tmp/assembly-smoke/delivery.mp4', { maxBytes: 50_000_000, maxDurationSec: 3, requireAudio: true });
const assemblyMeta = await ffprobe(checkedAssembly);
if (assemblyMeta.width !== 1080 || assemblyMeta.height !== 1920 || !assemblyMeta.hasAudio || assemblyMeta.videoCodec !== 'h264' || assemblyMeta.audioCodec !== 'aac' || Math.abs(assemblyMeta.durationSec - 2.5) > 1/30) throw Error('Invalid assembly smoke output: ' + JSON.stringify(assemblyMeta));
console.log('Network-disabled compiled three-shot assembly overlap/audio/full decode passed');
const archive = { videoPath: '/tmp/archive-out/clean.mp4', metadataPath: '/tmp/archive-out/captions.json' };
const executor = createExecutor({ runOp: mediaCore.runOp }, { strictMedia: true, outDir: '/tmp/archive-out', onCaptionLayer: (input, caption, after, ctx) => archiveCaptionLayer(input, caption, after, ctx, mediaCore.runOp, archive) });
const layered = await executor.enqueue({ id: 'archive-smoke', userId: 'smoke', platform: 'cli', mode: 'edit', isPro: true, limits: DEFAULT_LIMITS, source: { kind: 'upload', path: '/tmp/input.mp4' }, ops: [{ op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0, end: 1, text: 'Visible caption' }] }, { op: 'watermark', show: false, text: '' }] });
if (!layered.ok || !layered.outputPath) throw Error('Layered export failed');
const frameHash = path => execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', path, '-frames:v', '1', '-map', '0:v:0', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
if (frameHash(layered.outputPath) === frameHash(archive.videoPath)) throw Error('Captioned and clean frames unexpectedly match');
if (JSON.parse(await readFile(archive.metadataPath, 'utf8')).cues[0].text !== 'Visible caption') throw Error('Caption timing archive missing');
await prepareDelivery(layered.outputPath, '/tmp/archive-out/checked.mp4', { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
console.log('Caption archive survives executor cleanup; clean and captioned decoded frames differ');
const rawArchive = await readFile(archive.metadataPath, 'utf8');
const audioHash = path => execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
const originalAudio = audioHash(archive.videoPath);
const freeArchive = { videoPath: '/tmp/free-archive/clean.mp4', metadataPath: '/tmp/free-archive/captions.json' };
const freeExecutor = createExecutor({ runOp: mediaCore.runOp }, { strictMedia: true, outDir: '/tmp/free-archive', onCaptionLayer: (input, caption, after, ctx) => archiveCaptionLayer(input, caption, after, ctx, mediaCore.runOp, freeArchive) });
const freeLayered = await freeExecutor.enqueue({ id: 'free-archive', userId: 'smoke', platform: 'cli', mode: 'edit', isPro: false, limits: DEFAULT_LIMITS,
  source: { kind: 'upload', path: '/tmp/input.mp4' }, ops: [
    { op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0, end: 1, text: 'Visible caption' }] },
    { op: 'watermark', platform: true, show: true, text: 'made with takeone' },
  ],
});
if (!freeLayered.ok || !freeLayered.outputPath) throw Error('Free caption archive export failed');
if (frameHash(freeArchive.videoPath) !== frameHash('/tmp/input.mp4')) throw Error('Clean archive contains platform branding');
if (frameHash(freeLayered.outputPath) === frameHash(layered.outputPath)) throw Error('Free final export is missing its watermark');
const freeRaw = await readFile(freeArchive.metadataPath, 'utf8');
for (const paid of [false, true]) {
  const ctx = { tmpDir: '/tmp', isPro: paid, strictMedia: true };
  const captioned = await restyleCaptionArchive(freeArchive.videoPath, freeRaw, 'clean', ctx, mediaCore.runOp);
  const final = await mediaCore.runOp(captioned, { op: 'watermark', platform: true, show: !paid, text: 'made with takeone' }, ctx);
  const expected = paid ? layered.outputPath : freeLayered.outputPath;
  if (frameHash(final.outputPath) !== frameHash(expected)) throw Error('Caption edit applied wrong or repeated platform branding');
  if (audioHash(final.outputPath) !== originalAudio) throw Error('Branding edit changed source audio');
  await prepareDelivery(final.outputPath, `/tmp/free-archive/checked-${paid}.mp4`, { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
}
console.log('New free caption archive is unbranded; free edits brand once and paid edits add no mark; audio/decode passed');

// Real compiled stock streaming/probing/cutaway rendering, with only HTTP mocked.
const stockFetch = globalThis.fetch;
process.env.PEXELS_API_KEY = 'container-fixture';
process.env.BROLL_CACHE_DIR = '/tmp/stock-cache';
try {
  const stockBytes = await readFile('/tmp/stock.mp4');
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://api.pexels.com/videos/search?')) {
      return Response.json({ videos: [{ video_files: [{ file_type: 'video/mp4', width: 720, height: 1280, link: 'https://stock.example/fixture.mp4' }] }] });
    }
    if (String(url) === 'https://stock.example/fixture.mp4') return new Response(stockBytes);
    throw Error('Unexpected stock request');
  };
  const cutaway = await mediaCore.runOp('/tmp/cutaway-source.mp4', { op: 'cutaways', segments: [{ at: 2, dur: 1, keywords: ['red fixture'] }] }, { tmpDir: '/tmp', isPro: true, strictMedia: true });
  await prepareDelivery(cutaway.outputPath, '/tmp/cutaway-checked.mp4', { maxBytes: 10_000_000, maxDurationSec: 6, requireAudio: true });
  const cutawayFrame = path => execFileSync('ffmpeg', ['-v', 'error', '-ss', '2.5', '-i', path, '-frames:v', '1', '-map', '0:v:0', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
  if (cutawayFrame(cutaway.outputPath) === cutawayFrame('/tmp/cutaway-source.mp4')) throw Error('Cutaway did not change the source frame');
  if (audioHash(cutaway.outputPath) !== audioHash('/tmp/cutaway-source.mp4')) throw Error('Cutaway changed source audio');
  globalThis.fetch = async () => Response.json({ videos: [] });
  let missingRejected = false;
  try {
    await mediaCore.runOp('/tmp/cutaway-source.mp4', { op: 'cutaways', segments: [{ at: 2, dur: 1, keywords: ['missing fixture'] }] }, { tmpDir: '/tmp', isPro: true, strictMedia: true });
  } catch (error) { missingRejected = /Stock footage unavailable/.test(error.message); }
  if (!missingRejected) throw Error('Missing production cutaways were silently accepted');
  console.log('Compiled stock stream/cutaway render preserves audio; missing footage fails; HTTP mocked');
} finally {
  globalThis.fetch = stockFetch;
  delete process.env.PEXELS_API_KEY;
  delete process.env.BROLL_CACHE_DIR;
}
// Verify the compiled GIF downloader and responsive overlay on a small canvas.
process.env.GIPHY_API_KEY = 'container-fixture';
process.env.GIF_CACHE_DIR = '/tmp/sticker-cache';
try {
  const stickerBytes = await readFile('/tmp/sticker.gif');
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://api.giphy.com/v1/stickers/search?')) return Response.json({ data: [{ images: { fixed_height: { url: 'https://stock.example/sticker.gif' } } }] });
    if (String(url) === 'https://stock.example/sticker.gif') return new Response(stickerBytes);
    throw Error('Unexpected sticker request');
  };
  const sticker = await mediaCore.runOp('/tmp/cutaway-source.mp4', { op: 'gifs', items: [{ at: 1, dur: 2, query: 'red fixture' }] }, { tmpDir: '/tmp', isPro: true, strictMedia: true });
  await prepareDelivery(sticker.outputPath, '/tmp/sticker-checked.mp4', { maxBytes: 10_000_000, maxDurationSec: 6, requireAudio: true });
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', '2', '-i', sticker.outputPath, '-vf', 'crop=2:2:296:60,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-']);
  if (rgb[0] < 200 || rgb[1] > 60 || rgb[2] > 60) throw Error('Sticker not visible inside small canvas');
  if (audioHash(sticker.outputPath) !== audioHash('/tmp/cutaway-source.mp4')) throw Error('Sticker changed source audio');
  let archiveRequests = 0;
  globalThis.fetch = async url => {
    archiveRequests++;
    if (String(url).startsWith('https://api.giphy.com/v1/stickers/search?')) return Response.json({ data: [{ images: { fixed_height: { url: 'https://stock.example/sticker.gif' } } }] });
    if (String(url) === 'https://stock.example/sticker.gif') return new Response(stickerBytes);
    throw Error('Unexpected archive sticker request');
  };
  const stickerArchive = { videoPath: '/tmp/sticker-archive/clean.mp4', metadataPath: '/tmp/sticker-archive/captions.json' };
  let archiveCount = 0;
  const stickerExecutor = createExecutor({ runOp: mediaCore.runOp }, { strictMedia: true, outDir: '/tmp/sticker-archive', onCaptionLayer: async (input, caption, after, ctx) => {
    archiveCount++;
    await archiveCaptionLayer(input, caption, after, ctx, mediaCore.runOp, stickerArchive);
  } });
  const stickerPlan = applyEditPlan({ id: 'sticker-layer', userId: 'smoke', platform: 'cli', mode: 'edit', isPro: true, limits: DEFAULT_LIMITS,
    source: { kind: 'upload', path: '/tmp/cutaway-source.mp4' },
    ops: [{ op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0, end: 4, text: 'Editable sticker reel' }] }, { op: 'watermark', show: false, text: '' }],
  }, { gifs: [{ at: 1, dur: 2, query: 'archive fixture' }] });
  const layeredSticker = await stickerExecutor.enqueue(stickerPlan);
  if (!layeredSticker.ok || !layeredSticker.outputPath || archiveCount !== 1) throw Error('Sticker reel lost its editable caption layer');
  if (archiveRequests !== 2) throw Error('Caption archive refetched the sticker');
  const rawStickerArchive = await readFile(stickerArchive.metadataPath, 'utf8');
  const removedSticker = await restyleCaptionArchive(stickerArchive.videoPath, rawStickerArchive, 'none', { tmpDir: '/tmp', isPro: true, strictMedia: true }, mediaCore.runOp);
  const removedRgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', '2', '-i', removedSticker, '-vf', 'crop=2:2:296:60,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-']);
  if (removedRgb[0] < 200 || removedRgb[1] > 60 || removedRgb[2] > 60) throw Error('Removing captions removed the sticker');
  if (frameHash(layeredSticker.outputPath) === frameHash(removedSticker)) throw Error('Caption removal did not change the captioned picture');
  if (audioHash(removedSticker) !== audioHash('/tmp/cutaway-source.mp4')) throw Error('Sticker archive changed source audio');
  await prepareDelivery(removedSticker, '/tmp/sticker-archive/checked.mp4', { maxBytes: 10_000_000, maxDurationSec: 6, requireAudio: true });
  const restyledSticker = await restyleCaptionArchive(stickerArchive.videoPath, rawStickerArchive, 'meme', { tmpDir: '/tmp', isPro: true, strictMedia: true }, mediaCore.runOp);
  await prepareDelivery(restyledSticker, '/tmp/sticker-archive/restyled.mp4', { maxBytes: 10_000_000, maxDurationSec: 6, requireAudio: true });
  if (audioHash(restyledSticker) !== audioHash(removedSticker) || archiveRequests !== 2) throw Error('Sticker restyling changed audio or refetched provider footage');
  console.log('Planned sticker reel retains editable captions; removal/restyle preserves sticker and audio without refetch');
  const chainCtx = { tmpDir: '/tmp', isPro: true, strictMedia: true };
  const firstTarget = { videoPath: '/tmp/chain-clean-one.mp4', metadataPath: '/tmp/chain-captions-one.json' };
  await transformCaptionArchive(stickerArchive.videoPath, rawStickerArchive, firstTarget,
    { userId: 'smoke', prompt: 'trim 00:01 to 00:04 speed 2x', aspect: '1:1', style: 'clean', font: 'serif', position: 'bottom' }, chainCtx, mediaCore.runOp);
  const secondTarget = { videoPath: '/tmp/chain-clean-two.mp4', metadataPath: '/tmp/chain-captions-two.json' };
  const secondOutput = await transformCaptionArchive(firstTarget.videoPath, await readFile(firstTarget.metadataPath, 'utf8'), secondTarget,
    { userId: 'smoke', prompt: 'trim 00:00.2 to 00:01.2', aspect: '1:1', style: 'clean', font: 'serif', position: 'bottom' }, chainCtx, mediaCore.runOp);
  const secondRaw = await readFile(secondTarget.metadataPath, 'utf8');
  const chainCues = JSON.parse(secondRaw).cues;
  if (chainCues.length !== 1 || chainCues[0].start !== 0 || chainCues[0].end !== 1 || chainCues[0].text !== 'Editable sticker reel') throw Error('Successive edits lost saved wording/timing');
  const secondMeta = await prepareDelivery(secondOutput, '/tmp/chain-checked.mp4', { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
  if (!(await ffprobe(secondMeta)).hasAudio) throw Error('Chained edit lost audio');
  const chainRemoved = await restyleCaptionArchive(secondTarget.videoPath, secondRaw, 'none', chainCtx, mediaCore.runOp);
  if (audioHash(secondOutput) !== audioHash(chainRemoved)) throw Error('Chained caption edit changed edited speech audio');
  if (frameHash(secondOutput) === frameHash(chainRemoved)) throw Error('Chained edit no longer has removable captions');
  const chainRgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', chainRemoved, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 8 * 1024 * 1024 });
  let redPixels = 0;
  for (let i = 0; i < chainRgb.length; i += 3) if (chainRgb[i] > 180 && chainRgb[i+1] < 80 && chainRgb[i+2] < 80) redPixels++;
  if (redPixels < 100 || archiveRequests !== 2) throw Error('Chained edits removed or refetched the sticker');
  console.log('Two real timeline edits preserve caption timing/style, removable text, edited audio and sticker without provider calls');

  globalThis.fetch = async () => Response.json({ data: [] });
  let missing = false;
  try { await mediaCore.runOp('/tmp/cutaway-source.mp4', { op: 'gifs', items: [{ at: 1, dur: 2, query: 'missing fixture' }] }, { tmpDir: '/tmp', isPro: true, strictMedia: true }); }
  catch (error) { missing = /Sticker footage unavailable/.test(error.message); }
  if (!missing) throw Error('Missing sticker silently completed');
  console.log('Compiled GIF download/render is visible inside small canvas, preserves audio and rejects missing footage; HTTP mocked');
} finally {
  globalThis.fetch = stockFetch;
  delete process.env.GIPHY_API_KEY;
  delete process.env.GIF_CACHE_DIR;
}
const restyleCtx = { tmpDir: '/tmp', isPro: true, strictMedia: true };
const removed = await restyleCaptionArchive(archive.videoPath, rawArchive, 'none', restyleCtx, mediaCore.runOp);
if (frameHash(removed) !== frameHash(archive.videoPath)) throw Error('Removing captions changed the clean frame');
for (const style of ['meme', 'karaoke', 'clean']) {
  const restyled = await restyleCaptionArchive(archive.videoPath, rawArchive, style, restyleCtx, mediaCore.runOp);
  await prepareDelivery(restyled, `/tmp/archive-out/restyled-${style}.mp4`, { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
  if (audioHash(restyled) !== originalAudio) throw Error('Caption restyling changed source audio');
  if (frameHash(restyled) === frameHash(archive.videoPath)) throw Error('Restyling did not add visible captions');
}
let rejected = false;
try { await restyleCaptionArchive(archive.videoPath, '{"version":2}', 'clean', restyleCtx, mediaCore.runOp); } catch { rejected = true; }
if (!rejected) throw Error('Invalid archive was accepted');
const correctedRaw = replaceCaptionTexts(rawArchive, ['Corrected caption words']);
const correctedOutput = await restyleCaptionArchive(archive.videoPath, correctedRaw, 'clean', restyleCtx, mediaCore.runOp);
await prepareDelivery(correctedOutput, '/tmp/archive-out/corrected.mp4', { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
if (frameHash(correctedOutput) === frameHash(layered.outputPath)) throw Error('Corrected wording did not change the captioned frame');
if (audioHash(correctedOutput) !== originalAudio) throw Error('Wording correction changed source audio');
const topOutput = await restyleCaptionArchive(archive.videoPath, correctedRaw, 'clean', restyleCtx, mediaCore.runOp, 'top');
await prepareDelivery(topOutput, '/tmp/archive-out/top.mp4', { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
if (frameHash(topOutput) === frameHash(correctedOutput)) throw Error('Position change did not change frame');
if (audioHash(topOutput) !== originalAudio) throw Error('Position change altered audio');
console.log('Caption placement render passed');
const fontFrames = new Set();
for (const font of ['sans', 'serif', 'mono']) {
  const fontOutput = await restyleCaptionArchive(archive.videoPath, correctedRaw, 'clean', restyleCtx, mediaCore.runOp, 'bottom', font);
  await prepareDelivery(fontOutput, `/tmp/archive-out/font-${font}.mp4`, { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
  if (audioHash(fontOutput) !== originalAudio) throw Error(`Font ${font} changed source audio`);
  const hash = frameHash(fontOutput);
  if (hash === frameHash(archive.videoPath) || fontFrames.has(hash)) throw Error(`Font ${font} missing or rendered identically to another preset`);
  fontFrames.add(hash);
  await copyFile(fontOutput, `/tmp/archive-out/font-${font}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.5', '-i', fontOutput, '-frames:v', '1', `/tmp/archive-out/font-${font}.png`]);
}
console.log('All bundled caption fonts render distinct frames, preserve audio and decode');

for (const paid of [false, true]) {
  const soundtrackReplies = await app.handle({ userId: `branding-${paid}`, platform: 'cli', text: 'Add selected soundtrack', attachmentPath: '/tmp/input.mp4', isPro: paid, music: { trackPath: '/tmp/track.wav', volume: 0.2, duck: true } });
  const video = soundtrackReplies.find(reply => reply.kind === 'file');
  if (!video) throw Error('Soundtrack-only export failed');
  const samePicture = frameHash(video.filePath) === frameHash('/tmp/input.mp4');
  if (samePicture !== paid) throw Error('Soundtrack-only watermark rule failed');
  await prepareDelivery(video.filePath, `/tmp/branding-${paid}.mp4`, { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
}
console.log('Actual soundtrack-only renders preserve paid picture and add free branding');
// Exercise the owned-audio HTTP branch with real audio bytes while the entire
// container has network disabled. Only the HTTP transport is substituted.
const originalFetch = globalThis.fetch;
try {
  const bytes = await readFile('/tmp/track.wav');
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://staging.convex.cloud/api/storage/fixture-audio' || options.redirect !== 'error') throw Error('Unexpected uploaded-audio request');
    return new Response(bytes, { headers: { 'content-type': 'audio/wav' } });
  };
  process.env.CONVEX_URL = 'https://staging.convex.cloud';
  await downloadSoundtrack({ storageUrl: 'https://staging.convex.cloud/api/storage/fixture-audio', volume: 0.3, duck: true }, '/tmp/owned-track', new AbortController().signal, () => { throw Error('Unexpected catalog download'); });
} finally { globalThis.fetch = originalFetch; }
const ownedReplies = await app.handle({ userId: 'owned-audio', platform: 'cli', text: 'Add selected soundtrack', attachmentPath: '/tmp/input.mp4', isPro: true, music: { trackPath: '/tmp/owned-track', volume: 0.3, duck: true } });
const ownedOutput = ownedReplies.find(reply => reply.kind === 'file');
if (!ownedOutput) throw Error('Uploaded-audio mix failed');
if (frameHash(ownedOutput.filePath) !== frameHash('/tmp/input.mp4')) throw Error('Uploaded audio changed paid video frames');
if (audioHash(ownedOutput.filePath) === audioHash('/tmp/input.mp4')) throw Error('Uploaded audio did not change the mixed audio');
await prepareDelivery(ownedOutput.filePath, '/tmp/owned-audio-delivery.mp4', { maxBytes: 10_000_000, maxDurationSec: 2, requireAudio: true });
console.log('Owned-audio download/mix passed real Linux frame/audio/decode checks; HTTP mocked');

// Use real Linux processes to check process-group cancellation, including a
// simulated encoder descendant. No YouTube access or model credentials are used.
const processWork = '/tmp/cancel-smoke';
await mkdir(processWork);
const heartbeatPath = processWork + '/heartbeat';
const encoderScript = `require('node:fs').appendFileSync(${JSON.stringify(heartbeatPath)}, 'x'); setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(heartbeatPath)}, 'x'), 20);`;
await writeFile(processWork + '/yt-dlp', `#!${process.execPath}\nif (process.argv.includes('--version')) process.exit(0);\nrequire('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(encoderScript)}], { stdio: 'ignore' });\nsetInterval(() => {}, 1000);\n`);
await chmod(processWork + '/yt-dlp', 0o755);
const previousPath = process.env.PATH;
const controller = new AbortController();
let pending;
try {
  process.env.PATH = processWork + ':' + previousPath;
  pending = ingest.ingest({ kind: 'youtube', url: 'https://youtu.be/fixture' }, { ...DEFAULT_LIMITS, timeoutSec: 30 }, { tmpDir: processWork, isPro: true, signal: controller.signal }).catch(error => error);
  let started = false;
  for (let i = 0; i < 100; i++) {
    if ((await readFile(heartbeatPath).catch(() => Buffer.alloc(0))).length > 1) { started = true; break; }
    await delay(50);
  }
  if (!started) throw Error('Cancellation fixture did not start its encoder');
  controller.abort();
  const result = await pending;
  if (!(result instanceof Error) || !/abort/i.test(result.message)) throw Error('Ingest did not reject cancellation');
  await delay(100);
  const stopped = await readFile(heartbeatPath, 'utf8');
  await delay(200);
  if (await readFile(heartbeatPath, 'utf8') !== stopped) throw Error('Encoder descendant survived cancellation');
  console.log('Linux downloader and encoder descendant stop on cancellation');
} finally {
  controller.abort();
  await pending;
  if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
}
console.log('Archive restyling, wording correction and removal passed actual FFmpeg renders, frame/audio checks and full delivery decode');
JS
GCP_PROJECT=test-project GCP_REGION=us-central1 CLOUD_RUN_JOB=takeone-worker GCS_BUCKET=test-bucket DISPATCH_SECRET=smoke-only node --input-type=module <<'JS'
import './dist/managed/server.js';
try {
  const health = await fetch('http://127.0.0.1:8080/healthz');
  if (health.status !== 200 || (await health.json()).ok !== true) throw new Error('Health check failed');
  const denied = await fetch('http://127.0.0.1:8080/dispatch', { method: 'POST', body: JSON.stringify({ jobId: 'fixture' }) });
  if (denied.status !== 401) throw new Error('Unauthenticated dispatch was not rejected');
  console.log('Packaged dispatcher health and authentication smoke passed');
  process.exit(0);
} catch (error) { console.error(error); process.exit(1); }
JS
