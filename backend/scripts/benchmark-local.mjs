// Run after npm --prefix backend run build. No network calls or paid providers.
import { mkdir, mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch } from 'node:os';
import { join, resolve } from 'node:path';
import { ff } from '../dist/media/ffmpeg.js';
import { prepareDelivery } from '../dist/media/delivery.js';
import { runWorker } from '../dist/managed/worker.js';
import { summarize } from '../../scripts/summarize-latency.mjs';

const outputDir = resolve(process.argv[2] ?? 'backend/tmp/benchmark');
await mkdir(outputDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'takeone-benchmark-'));
const logs = [];
let active = 0, peak = 0;
const started = performance.now();
try {
  const source = join(work, 'source.mp4');
  await ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-t', '3', source]);
  const outcomes = await Promise.all(Array.from({ length: 10 }, (_, i) => {
    const jobId = `local-${i + 1}`;
    const job = { jobId, userId: `fixture-user-${i}`, mode: 'edit', prompt: 'Synthetic local benchmark', aspect: '9:16', isPro: true, leaseToken: 'local-lease' };
    return runWorker(jobId, {
      claim: async () => job, heartbeat: async () => true,
      render: async (_job, signal) => {
        active++; peak = Math.max(peak, active);
        try {
          const path = join(work, `${jobId}.mp4`);
          await ff(['-protocol_whitelist', 'file', '-i', source, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', '-filter_threads', '1', '-threads', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path], signal);
          return await prepareDelivery(path, join(work, `${jobId}-ready.mp4`), { maxBytes: 50 * 1024 * 1024, maxDurationSec: 5, requireAudio: true }, signal);
        } finally { active--; }
      },
      upload: async path => { if (i === 0) await copyFile(path, join(outputDir, 'sample.mp4')); },
      complete: async () => true, fail: async () => true, cleanup: async () => {}, deliver: async () => {},
      log: line => { try { logs.push(JSON.parse(line)); } catch {} },
    });
  }));
  const report = {
    environment: 'Local synthetic benchmark; cloud claim/upload/finalize/Telegram services are stubbed',
    hardware: { platform: platform(), architecture: arch(), logicalCpus: cpus().length },
    fixture: '3-second synthetic video with a tone; 1080x1920 H264/AAC output; full decode validation',
    concurrentJobs: 10, observedPeakRenderCalls: peak, elapsedMs: Math.round(performance.now() - started), outcomes,
    latency: summarize(logs),
  };
  await writeFile(join(outputDir, 'worker-events.jsonl'), logs.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (outcomes.some(result => result !== 'completed') || peak !== 10) process.exitCode = 1;
} finally { await rm(work, { recursive: true, force: true }); }
