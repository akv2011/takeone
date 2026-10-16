export interface VeoConfig { project: string; region: string; model: string; bucket: string }
export interface VeoRequest { jobId: string; prompt: string; aspect: '9:16' | '16:9'; operation?: string }
export interface VeoDeps {
  post(url: string, body: unknown, signal: AbortSignal): Promise<any>;
  begin(): Promise<boolean>;
  save(operation: string): Promise<void>;
  wait(signal: AbortSignal): Promise<void>;
}
/** A persisted operation is polled on retry; ambiguous creation is never auto-repeated. */
export async function generateScene(config: VeoConfig, request: VeoRequest, deps: VeoDeps, signal: AbortSignal): Promise<string> {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.project) || !/^[a-z]+-[a-z]+\d$/.test(config.region) ||
      !/^veo-3[a-zA-Z0-9.-]+$/.test(config.model) || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(config.bucket) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(request.jobId) || !['9:16', '16:9'].includes(request.aspect) || request.prompt.length < 6 || request.prompt.length > 4000) throw new Error('Invalid AI video configuration');
  const modelPath = `projects/${config.project}/locations/${config.region}/publishers/google/models/${config.model}`;
  const endpoint = `https://${config.region}-aiplatform.googleapis.com/v1/${modelPath}`;
  const prefix = `gs://${config.bucket}/ai/${request.jobId}/`;
  let operation = request.operation;
  signal.throwIfAborted();
  if (!operation) {
    if (!await deps.begin()) throw new Error('AI generation start is awaiting reconciliation');
    const result = await deps.post(`${endpoint}:predictLongRunning`, {
      instances: [{ prompt: request.prompt }],
      parameters: { storageUri: prefix, sampleCount: 1, durationSeconds: 8, aspectRatio: request.aspect, generateAudio: true, resolution: '720p' },
    }, signal);
    operation = result.name;
    if (typeof operation !== 'string' || !operation.startsWith(`${modelPath}/operations/`) || !/^[\w-]+$/.test(operation.slice(`${modelPath}/operations/`.length))) throw new Error('Invalid AI operation');
    await deps.save(operation);
  }
  if (!operation.startsWith(`${modelPath}/operations/`) || !/^[\w-]+$/.test(operation.slice(`${modelPath}/operations/`.length))) throw new Error('AI operation does not match configured model');
  for (let poll = 0; poll < 45; poll++) {
    signal.throwIfAborted();
    const result = await deps.post(`${endpoint}:fetchPredictOperation`, { operationName: operation }, signal);
    if (result.error) throw new Error('AI video provider failed');
    if (result.done === true) {
      const videos = result.response?.videos;
      if (!Array.isArray(videos) || videos.length !== 1) throw new Error('AI provider did not return one video');
      const uri = videos[0].gcsUri;
      if (videos[0].mimeType !== 'video/mp4' || typeof uri !== 'string' || !uri.startsWith(prefix) || !/^[a-zA-Z0-9_./-]+\.mp4$/.test(uri.slice(prefix.length)) || uri.split('/').includes('..')) throw new Error('Invalid AI output location');
      return uri.slice(`gs://${config.bucket}/`.length);
    }
    await deps.wait(signal);
  }
  throw new Error('AI generation is still pending');
}
