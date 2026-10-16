import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { enqueue, owner } from './jobs';
import { normalizeTimeline, timelineDocumentValidator, timelineSourceValidator, type TimelineDocument, type TimelineSource } from './timelineValues';
import { hasManagedVideoOutput, hasTrustedMediaMetadata } from './mediaMetadata';

export const MAX_PROJECT_REVISIONS = 1_000;

function unavailable(): never {
  throw new ConvexError('PROJECT_SOURCE_UNAVAILABLE');
}

function sameTimeline(left: TimelineDocument, right: TimelineDocument): boolean {
  return JSON.stringify(normalizeTimeline(left)) === JSON.stringify(normalizeTimeline(right));
}

function validateRequestId(requestId: string) {
  if (!/^[\w-]{8,100}$/.test(requestId)) throw new ConvexError('INVALID_REQUEST_ID');
}

async function projectView(ctx: any, project: any, revision?: any) {
  const selected = revision ?? (project.activeRevisionId ? await ctx.db.get(project.activeRevisionId) : null);
  if (!selected || selected.projectId !== project._id || selected.userId !== project.userId) return null;
  return {
    projectId: project._id,
    name: project.name,
    activeRevisionId: selected._id,
    revision: selected.revision,
    timeline: selected.timeline,
    updatedAt: revision ? selected.createdAt : project.updatedAt,
  };
}

async function resolveSource(ctx: any, userId: string, reference: TimelineSource, requireTrustedJob = false) {
  const source = reference.kind === 'job' ? await ctx.db.get(reference.jobId) : await ctx.db.get(reference.uploadId);
  if (reference.kind === 'job') {
    if (!source || source.userId !== userId || source.status !== 'done' || !source.storageKey ||
      (requireTrustedJob && !hasTrustedMediaMetadata(source))) unavailable();
  } else if (!source || source.userId !== userId || source.status !== 'ready' || source.kind === 'audio' ||
    !source.storageId || !hasTrustedMediaMetadata(source)) unavailable();
  return source;
}

async function validateSources(ctx: any, userId: string, timeline: TimelineDocument, requireTrustedJobs = false) {
  const sources = new Map<string, any>();
  for (const clip of timeline.video) {
    const key = clip.source.kind === 'job' ? `job:${clip.source.jobId}` : `upload:${clip.source.uploadId}`;
    let source = sources.get(key);
    if (!source) {
      source = await resolveSource(ctx, userId, clip.source, requireTrustedJobs);
      sources.set(key, source);
    }
    if (source.mediaDurationMs !== undefined && clip.sourceEndMs > source.mediaDurationMs) unavailable();
  }
}

async function validateExportSources(ctx: any, userId: string, timeline: TimelineDocument) {
  const sources = new Map<string, any>();
  for (const clip of timeline.video) {
    const key = sourceKey(clip.source);
    let source = sources.get(key);
    if (!source) {
      source = await resolveSource(ctx, userId, clip.source, true);
      if (clip.source.kind === 'job') {
        if (!hasManagedVideoOutput(source)) unavailable();
      } else if (!await ctx.storage.getUrl(source.storageId)) {
        unavailable();
      }
      sources.set(key, source);
    }
    if (clip.sourceEndMs > source.mediaDurationMs) unavailable();
  }
}

function normalizeProjectName(name: string): string {
  const normalized = name.trim();
  if (!normalized || normalized.length > 80) throw new ConvexError('INVALID_PROJECT_NAME');
  return normalized;
}

function sourceKey(source: TimelineSource): string {
  return source.kind === 'job' ? `job:${source.jobId}` : `upload:${source.uploadId}`;
}

function sourceDescriptor(reference: TimelineSource, source: any) {
  if (!hasTrustedMediaMetadata(source)) unavailable();
  return {
    source: reference,
    label: reference.kind === 'job'
      ? (source.prompt.trim().slice(0, 80) || 'Generated video')
      : (source.name.trim().slice(0, 80) || 'Uploaded video'),
    durationMs: source.mediaDurationMs,
    width: source.mediaWidth,
    height: source.mediaHeight,
    hasAudio: source.mediaHasAudio,
  };
}

function assemblyFingerprint(input: {
  name: string; aspect: '9:16' | '1:1' | '16:9'; fit: 'crop' | 'fit';
  preserveAudio: boolean; targetDurationMs: number; sources: TimelineSource[];
}) {
  return JSON.stringify({
    name: input.name, aspect: input.aspect, fit: input.fit, preserveAudio: input.preserveAudio,
    targetDurationMs: input.targetDurationMs, sources: input.sources.map(sourceKey),
  });
}

function allocateAssemblyDuration(targetDurationMs: number, capacities: number[]): number[] {
  const minimumClipDurationMs = 100;
  if (targetDurationMs < capacities.length * minimumClipDurationMs ||
    capacities.some(capacity => capacity < minimumClipDurationMs) ||
    capacities.reduce((sum, value) => sum + value, 0) < targetDurationMs) {
    throw new ConvexError('ASSEMBLY_DURATION_UNAVAILABLE');
  }
  const remainingCapacities = capacities.map(capacity => capacity - minimumClipDurationMs);
  const remainingTarget = targetDurationMs - capacities.length * minimumClipDurationMs;
  let low = 0;
  let high = Math.max(...remainingCapacities);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const used = remainingCapacities.reduce((sum, capacity) => sum + Math.min(capacity, middle), 0);
    if (used <= remainingTarget) low = middle;
    else high = middle - 1;
  }
  const allocation = remainingCapacities.map(capacity => minimumClipDurationMs + Math.min(capacity, low));
  let remainder = targetDurationMs - allocation.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0 && index < allocation.length; index += 1) {
    if (allocation[index] < capacities[index]) {
      allocation[index] += 1;
      remainder -= 1;
    }
  }
  if (remainder !== 0 || allocation.some(durationMs => durationMs < minimumClipDurationMs)) {
    throw new ConvexError('ASSEMBLY_DURATION_UNAVAILABLE');
  }
  return allocation;
}

// This helper is called by every projectRevisions insertion site below; keep revision and source writes atomic.
async function insertProjectSources(ctx: any, userId: string, projectId: any, revisionId: any, timeline: TimelineDocument) {
  const seen = new Set<string>();
  for (const clip of timeline.video) {
    const key = clip.source.kind === 'job' ? `job:${clip.source.jobId}` : `upload:${clip.source.uploadId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ctx.db.insert('projectSources', {
      userId, projectId, revisionId, kind: clip.source.kind,
      ...(clip.source.kind === 'job' ? { jobId: clip.source.jobId } : { uploadId: clip.source.uploadId }),
    });
  }
}

export const forSource = query({
  args: { sourceJobId: v.id('genJobs'), accountKey: v.string() },
  handler: async (ctx, { sourceJobId, accountKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('UNAUTHENTICATED');
    if (identity.subject !== accountKey) return null;
    const project = await ctx.db.query('projects')
      .withIndex('by_user_source', (q: any) => q.eq('userId', identity.subject).eq('sourceJobId', sourceJobId))
      .unique();
    return project ? projectView(ctx, project) : null;
  },
});

export const get = query({
  args: { projectId: v.id('projects'), accountKey: v.string() },
  handler: async (ctx, { projectId, accountKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('UNAUTHENTICATED');
    if (identity.subject !== accountKey) return null;
    const project = await ctx.db.get(projectId);
    return project && project.userId === identity.subject ? projectView(ctx, project) : null;
  },
});

export const listSources = query({
  args: { accountKey: v.string() },
  handler: async (ctx, { accountKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('UNAUTHENTICATED');
    if (identity.subject !== accountKey) return [];
    const [jobs, uploads] = await Promise.all([
      ctx.db.query('genJobs').withIndex('by_user_status', (q: any) => q.eq('userId', identity.subject).eq('status', 'done')).order('desc').take(50),
      ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', identity.subject).eq('status', 'ready')).order('desc').take(10),
    ]);
    return [
      ...jobs.filter((job: any) => job.status === 'done' && job.storageKey && hasTrustedMediaMetadata(job)).map((job: any) => ({
        source: { kind: 'job' as const, jobId: job._id },
        label: job.prompt.trim().slice(0, 80) || 'Generated video',
        durationMs: job.mediaDurationMs, width: job.mediaWidth, height: job.mediaHeight,
        hasAudio: job.mediaHasAudio, createdAt: job.createdAt,
      })),
      ...uploads.filter((upload: any) => upload.kind !== 'audio' && upload.storageId && hasTrustedMediaMetadata(upload)).map((upload: any) => ({
        source: { kind: 'upload' as const, uploadId: upload._id },
        label: upload.name.trim().slice(0, 80) || 'Uploaded video',
        durationMs: upload.mediaDurationMs, width: upload.mediaWidth, height: upload.mediaHeight,
        hasAudio: upload.mediaHasAudio, createdAt: upload.createdAt,
      })),
    ].sort((left, right) => right.createdAt - left.createdAt).slice(0, 50).map(({ createdAt: _createdAt, ...source }) => source);
  },
});

export const sourcesForRevision = query({
  args: { projectId: v.id('projects'), revisionId: v.id('projectRevisions'), accountKey: v.string() },
  handler: async (ctx, { projectId, revisionId, accountKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('UNAUTHENTICATED');
    if (identity.subject !== accountKey) return [];
    const [project, revision] = await Promise.all([ctx.db.get(projectId), ctx.db.get(revisionId)]);
    if (!project || project.userId !== identity.subject || !revision ||
      revision.projectId !== projectId || revision.userId !== identity.subject) return [];
    const result = [];
    const seen = new Set<string>();
    for (const clip of revision.timeline.video) {
      const key = sourceKey(clip.source);
      if (seen.has(key)) continue;
      seen.add(key);
      const source = await resolveSource(ctx, identity.subject, clip.source, true);
      result.push(sourceDescriptor(clip.source, source));
    }
    return result;
  },
});

export const createAssembly = mutation({
  args: {
    name: v.string(), requestId: v.string(), confirmedOwnership: v.boolean(),
    aspect: v.union(v.literal('9:16'), v.literal('1:1'), v.literal('16:9')),
    fit: v.union(v.literal('crop'), v.literal('fit')), preserveAudio: v.boolean(),
    targetDurationMs: v.number(), sources: v.array(timelineSourceValidator),
  },
  handler: async (ctx, args) => {
    const user = await owner(ctx);
    validateRequestId(args.requestId);
    if (!args.confirmedOwnership) throw new ConvexError('CONFIRM_VIDEO_RIGHTS');
    const name = normalizeProjectName(args.name);
    if (args.sources.length < 2 || args.sources.length > 12) throw new ConvexError('INVALID_ASSEMBLY_SOURCES');
    if (!Number.isInteger(args.targetDurationMs) || args.targetDurationMs < 100 || args.targetDurationMs > 300_000) {
      throw new ConvexError('INVALID_ASSEMBLY_DURATION');
    }
    if (new Set(args.sources.map(sourceKey)).size > 8) throw new ConvexError('TOO_MANY_ASSEMBLY_SOURCES');
    const fingerprint = assemblyFingerprint({ ...args, name });
    const prior = await ctx.db.query('projects')
      .withIndex('by_user_create_request', (q: any) => q.eq('userId', user.tokenIdentifier).eq('createRequestId', args.requestId))
      .unique();
    if (prior) {
      if (prior.createFingerprint !== fingerprint) throw new ConvexError('REQUEST_CONTENT_CONFLICT');
      const view = await projectView(ctx, prior);
      if (!view) throw new ConvexError('PROJECT_NOT_FOUND');
      return view;
    }

    const resolved = new Map<string, any>();
    for (const source of args.sources) {
      const key = sourceKey(source);
      if (!resolved.has(key)) resolved.set(key, await resolveSource(ctx, user.tokenIdentifier, source, true));
    }
    const allocation = allocateAssemblyDuration(args.targetDurationMs, args.sources.map(source => resolved.get(sourceKey(source)).mediaDurationMs));
    let timelineStartMs = 0;
    const video = args.sources.map((source, index) => {
      const durationMs = allocation[index];
      const clip = {
        id: `clip-${String(index + 1).padStart(3, '0')}`, source, sourceStartMs: 0,
        sourceEndMs: durationMs, timelineStartMs, fit: args.fit, muted: !args.preserveAudio,
      };
      timelineStartMs += durationMs;
      return clip;
    });
    const timeline = normalizeTimeline({
      version: 1, aspect: args.aspect, durationMs: args.targetDurationMs,
      video, transitions: [], text: [], graphics: [],
    });
    const now = Date.now();
    const projectId = await ctx.db.insert('projects', {
      userId: user.tokenIdentifier, name, createRequestId: args.requestId, createFingerprint: fingerprint,
      createdAt: now, updatedAt: now,
    });
    const activeRevisionId = await ctx.db.insert('projectRevisions', {
      userId: user.tokenIdentifier, projectId, revision: 1, requestId: args.requestId, timeline, createdAt: now,
    });
    await insertProjectSources(ctx, user.tokenIdentifier, projectId, activeRevisionId, timeline);
    await ctx.db.patch(projectId, { activeRevisionId });
    return { projectId, name, activeRevisionId, revision: 1, timeline, updatedAt: now };
  },
});

export const createFromJob = mutation({
  args: { sourceJobId: v.id('genJobs'), durationMs: v.number(), requestId: v.string() },
  handler: async (ctx, { sourceJobId, durationMs, requestId }) => {
    const user = await owner(ctx);
    validateRequestId(requestId);
    const source = await ctx.db.get(sourceJobId);
    if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done' || !source.storageKey) unavailable();
    const timeline = normalizeTimeline({
      version: 1,
      aspect: source.aspect === '1:1' || source.aspect === '16:9' ? source.aspect : '9:16',
      durationMs,
      video: [{
        id: `source-${sourceJobId}`, source: { kind: 'job', jobId: sourceJobId },
        sourceStartMs: 0, sourceEndMs: durationMs, timelineStartMs: 0, fit: 'crop', muted: false,
      }],
      transitions: [], text: [], graphics: [],
    });
    if (source.mediaDurationMs !== undefined && durationMs > source.mediaDurationMs) unavailable();
    const existing = await ctx.db.query('projects')
      .withIndex('by_user_source', (q: any) => q.eq('userId', user.tokenIdentifier).eq('sourceJobId', sourceJobId))
      .unique();
    if (existing) return projectView(ctx, existing);

    const now = Date.now();
    const name = source.prompt.trim().slice(0, 80) || 'Untitled project';
    const projectId = await ctx.db.insert('projects', { userId: user.tokenIdentifier, sourceJobId, name, createdAt: now, updatedAt: now });
    const activeRevisionId = await ctx.db.insert('projectRevisions', {
      userId: user.tokenIdentifier, projectId, revision: 1, requestId, timeline, createdAt: now,
    });
    await insertProjectSources(ctx, user.tokenIdentifier, projectId, activeRevisionId, timeline);
    await ctx.db.patch(projectId, { activeRevisionId });
    return { projectId, name, activeRevisionId, revision: 1, timeline, updatedAt: now };
  },
});

export const saveRevision = mutation({
  args: {
    projectId: v.id('projects'), parentRevisionId: v.id('projectRevisions'),
    requestId: v.string(), timeline: timelineDocumentValidator,
  },
  handler: async (ctx, { projectId, parentRevisionId, requestId, timeline }) => {
    const user = await owner(ctx);
    validateRequestId(requestId);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== user.tokenIdentifier) throw new ConvexError('PROJECT_NOT_FOUND');
    const normalized = normalizeTimeline(timeline);
    const prior = await ctx.db.query('projectRevisions')
      .withIndex('by_project_request', (q: any) => q.eq('projectId', projectId).eq('requestId', requestId))
      .unique();
    if (prior) {
      if (prior.parentRevisionId !== parentRevisionId || !sameTimeline(prior.timeline, normalized)) throw new ConvexError('REQUEST_CONTENT_CONFLICT');
      return projectView(ctx, project, prior);
    }
    if (project.activeRevisionId !== parentRevisionId) throw new ConvexError('PROJECT_REVISION_CONFLICT');
    const parent = await ctx.db.get(parentRevisionId);
    if (!parent || parent.projectId !== projectId || parent.userId !== user.tokenIdentifier) throw new ConvexError('PROJECT_REVISION_CONFLICT');
    if (parent.revision >= MAX_PROJECT_REVISIONS) throw new ConvexError('PROJECT_REVISION_LIMIT');
    await validateSources(ctx, user.tokenIdentifier, normalized, project.sourceJobId === undefined);

    const now = Date.now();
    const activeRevisionId = await ctx.db.insert('projectRevisions', {
      userId: user.tokenIdentifier, projectId, parentRevisionId, revision: parent.revision + 1,
      requestId, timeline: normalized, createdAt: now,
    });
    await insertProjectSources(ctx, user.tokenIdentifier, projectId, activeRevisionId, normalized);
    await ctx.db.patch(projectId, { activeRevisionId, updatedAt: now });
    return { projectId, name: project.name, activeRevisionId, revision: parent.revision + 1, timeline: normalized, updatedAt: now };
  },
});

export const requestExport = mutation({
  args: {
    projectId: v.id('projects'), revisionId: v.id('projectRevisions'), requestId: v.string(),
  },
  handler: async (ctx, { projectId, revisionId, requestId }) => {
    const user = await owner(ctx);
    validateRequestId(requestId);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== user.tokenIdentifier) throw new ConvexError('PROJECT_NOT_FOUND');
    const revision = await ctx.db.get(revisionId);
    if (!revision || revision.projectId !== projectId || revision.userId !== user.tokenIdentifier) {
      throw new ConvexError('PROJECT_REVISION_NOT_FOUND');
    }
    const timeline = normalizeTimeline(revision.timeline);
    const uniqueSources = new Set(timeline.video.map(clip => sourceKey(clip.source)));
    if (timeline.video.length < 2 || timeline.video.length > 12 || uniqueSources.size > 8 ||
      timeline.durationMs > 300_000 || timeline.text.length > 0 || timeline.graphics.length > 0) {
      throw new ConvexError('UNSUPPORTED_PROJECT_EXPORT');
    }
    const input = {
      mode: 'edit', prompt: 'Export project', requestId, aspect: timeline.aspect,
      projectId, projectRevisionId: revisionId,
      timelineExport: { profile: { container: 'mp4' as const, fps: 30 as const }, timeline },
    };
    // Preserve enqueue's exact-retry contract even if an accepted source changes later.
    // New admissions still revalidate every source immediately before the debit.
    const prior = await ctx.db.query('genJobs')
      .withIndex('by_request', (q: any) => q.eq('userId', user.tokenIdentifier).eq('requestId', requestId))
      .unique();
    if (prior) return enqueue(ctx, user, input);
    await validateExportSources(ctx, user.tokenIdentifier, timeline);
    return enqueue(ctx, user, input);
  },
});
