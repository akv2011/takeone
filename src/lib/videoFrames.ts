export type VideoFrame = { time: number; image: string };

export function frameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw Error('Invalid video duration');
  return Array.from({ length: 8 }, (_, i) => duration * (i + 0.5) / 8);
}

function event(video: HTMLVideoElement, name: string, signal: AbortSignal, start: () => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { video.removeEventListener(name, done); video.removeEventListener('error', fail); signal.removeEventListener('abort', abort); clearTimeout(timer); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(Error('Frame preview unavailable')); };
    const abort = () => { cleanup(); reject(signal.reason ?? Error('Cancelled')); };
    const timer = setTimeout(fail, 10_000);
    video.addEventListener(name, done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try { start(); } catch { fail(); }
  });
}

/** One sequential decoder, eight small previews; no upload, mutation or export. */
export async function extractVideoFrames(url: string, signal: AbortSignal): Promise<VideoFrame[]> {
  signal.throwIfAborted();
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  try {
    await event(video, 'loadeddata', signal, () => { video.src = url; video.load(); });
    const times = frameTimes(video.duration);
    if (!video.videoWidth || !video.videoHeight) throw Error('Missing video dimensions');
    const context = canvas.getContext('2d');
    if (!context) throw Error('Frame preview unavailable');
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale, height = video.videoHeight * scale;
    const frames: VideoFrame[] = [];
    for (const time of times) {
      signal.throwIfAborted();
      await event(video, 'seeked', signal, () => { video.currentTime = time; });
      signal.throwIfAborted();
      context.fillStyle = '#181818'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      frames.push({ time, image: canvas.toDataURL('image/jpeg', 0.65) });
    }
    return frames;
  } finally {
    video.pause(); video.removeAttribute('src'); video.load();
    canvas.width = 0; canvas.height = 0;
  }
}
