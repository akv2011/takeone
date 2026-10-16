import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import type { TimelineDocument, TimelineSource } from '../convex/timelineValues';

const modules = import.meta.glob('../convex/**/*.ts');
const requestExport = ref<'mutation'>('projects:requestExport');
const claimJob = ref<'mutation'>('generate:claimJob');
const pump = ref<'mutation'>('jobs:pump');
const failJob = ref<'mutation'>('generate:failJob');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('WORKER_SECRET', 'test-secret');
  vi.stubEnv('MANAGED_RENDERING_PAUSED', 'false');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function timeline(sources: TimelineSource[], patch: Partial<TimelineDocument> = {}): TimelineDocument {
  const video = sources.map((source, index) => ({
    id: `clip-${index}`, source, sourceStartMs: 0, sourceEndMs: 1_000,
    timelineStartMs: index * 1_000, fit: 'crop' as const, muted: index % 2 === 1,
  }));
  return {
    version: 1, aspect: '16:9', durationMs: sources.length * 1_000,
    video, transitions: [], text: [], graphics: [], ...patch,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 4, freeUsed: 0 });
    await ctx.db.insert('users', { tokenIdentifier: 'other', credits: 4, freeUsed: 0 });
  });
  const addJob = async (userId = 'owner', patch: Record<string, unknown> = {}) => {
    const jobId = await t.run(ctx => ctx.db.insert('genJobs', {
      userId, mode: 'generate', prompt: 'Trusted source', status: 'done', createdAt: 1,
      mediaDurationMs: 5_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true,
      ...patch,
    }));
    await t.run(ctx => ctx.db.patch(jobId, { storageKey: `videos/${jobId}/source-lease.mp4` }));
    return jobId;
  };
  const addUpload = async (userId = 'owner', patch: Record<string, unknown> = {}) => {
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(['video'], { type: 'video/mp4' })));
    return t.run(ctx => ctx.db.insert('uploads', {
      userId, name: 'source.mp4', size: 5, contentType: 'video/mp4', kind: 'video',
      status: 'ready', storageId, createdAt: 1, confirmedOwnership: true,
      mediaDurationMs: 5_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: false,
      ...patch,
    }));
  };
  const addProject = async (value: TimelineDocument, userId = 'owner') => t.run(async ctx => {
    const projectId = await ctx.db.insert('projects', { userId, name: 'Assembly', createdAt: 1, updatedAt: 1 });
    const revisionId = await ctx.db.insert('projectRevisions', {
      userId, projectId, revision: 1, requestId: `revision-${userId}`, timeline: value, createdAt: 1,
    });
    await ctx.db.patch(projectId, { activeRevisionId: revisionId });
    return { projectId, revisionId };
  });
  return { t, owner: t.withIdentity({ subject: 'owner' }), other: t.withIdentity({ subject: 'other' }), addJob, addUpload, addProject };
}

describe('project export admission', () => {
  test('snapshots an exact owned revision with a server-owned MP4/30fps profile and charges once', async () => {
    const { t, owner, addJob, addUpload, addProject } = await setup();
    const jobId = await addJob();
    const uploadId = await addUpload();
    const original = timeline([{ kind: 'job', jobId }, { kind: 'upload', uploadId }]);
    original.durationMs = 1_750;
    original.video[1].timelineStartMs = 750;
    original.transitions = [{
      id: 'join', fromClipId: 'clip-0', toClipId: 'clip-1', type: 'crossfade', durationMs: 250,
    }];
    const { projectId, revisionId } = await addProject(original);

    const first = await owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-request-1' });
    expect(await owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-request-1' })).toEqual(first);
    expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(1);
    const saved = await t.run(ctx => ctx.db.get(first.jobId));
    expect(saved).toMatchObject({
      projectId, projectRevisionId: revisionId, mode: 'edit', prompt: 'Export project',
      timelineExport: { profile: { container: 'mp4', fps: 30 }, timeline: original },
    });
    original.video[0].sourceEndMs = 900;
    expect(saved?.timelineExport.timeline.video[0].sourceEndMs).toBe(1_000);
    await t.run(ctx => ctx.db.delete(uploadId));
    expect(await owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-request-1' })).toEqual(first);
    expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(1);
  });

  test('exports an exact older owned revision and rejects foreign project/revision pairs before debit', async () => {
    const { t, owner, other, addJob, addProject } = await setup();
    const firstSource = await addJob();
    const secondSource = await addJob();
    const firstTimeline = timeline([{ kind: 'job', jobId: firstSource }, { kind: 'job', jobId: secondSource }]);
    const { projectId, revisionId } = await addProject(firstTimeline);
    const nextRevisionId = await t.run(ctx => ctx.db.insert('projectRevisions', {
      userId: 'owner', projectId, parentRevisionId: revisionId, revision: 2,
      requestId: 'revision-owner-next', timeline: { ...firstTimeline, video: firstTimeline.video.map(clip => ({ ...clip, muted: true })) }, createdAt: 2,
    }));
    await t.run(ctx => ctx.db.patch(projectId, { activeRevisionId: nextRevisionId }));
    await expect(owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-old-revision' })).resolves.toMatchObject({ billing: 'free' });

    const foreign = await addProject(firstTimeline, 'other');
    await expect(other.mutation(requestExport, { projectId, revisionId, requestId: 'export-foreign-project' })).rejects.toThrow('PROJECT_NOT_FOUND');
    await expect(owner.mutation(requestExport, { projectId, revisionId: foreign.revisionId, requestId: 'export-foreign-revision' })).rejects.toThrow('PROJECT_REVISION_NOT_FOUND');
    await expect(t.mutation(requestExport, { projectId, revisionId, requestId: 'export-no-auth' })).rejects.toThrow('UNAUTHENTICATED');
    await expect(t.withIdentity({ subject: 'missing' }).mutation(requestExport, { projectId, revisionId, requestId: 'export-no-user' })).rejects.toThrow('NO_USER');
    expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'other')).unique()))?.freeUsed).toBe(0);
  });

  test('rejects deleted, drifted, non-final or untrusted sources before debit', async () => {
    const candidates: Array<(fixture: Awaited<ReturnType<typeof setup>>) => Promise<TimelineSource>> = [
      async f => { const id = await f.addJob(); await f.t.run(ctx => ctx.db.patch(id, { status: 'failed' })); return { kind: 'job', jobId: id }; },
      async f => { const id = await f.addJob(); await f.t.run(ctx => ctx.db.patch(id, { mediaDurationMs: undefined })); return { kind: 'job', jobId: id }; },
      async f => { const id = await f.addJob(); await f.t.run(ctx => ctx.db.patch(id, { storageKey: `videos/${id}/source-lease.mp4`, mediaDurationMs: 999 })); return { kind: 'job', jobId: id }; },
      async f => { const id = await f.addJob(); await f.t.run(ctx => ctx.db.patch(id, { storageKey: 'private/not-final.mp4' })); return { kind: 'job', jobId: id }; },
      async f => ({ kind: 'job', jobId: await f.addJob('other') }),
      async f => { const id = await f.addUpload(); await f.t.run(ctx => ctx.db.delete(id)); return { kind: 'upload', uploadId: id }; },
      async f => { const id = await f.addUpload(); await f.t.run(ctx => ctx.db.patch(id, { status: 'failed' })); return { kind: 'upload', uploadId: id }; },
      async f => { const id = await f.addUpload(); await f.t.run(async ctx => { const row = await ctx.db.get(id); await ctx.storage.delete(row!.storageId!); }); return { kind: 'upload', uploadId: id }; },
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const fixture = await setup();
      const good = await fixture.addJob();
      const source = await candidates[index](fixture);
      const { projectId, revisionId } = await fixture.addProject(timeline([{ kind: 'job', jobId: good }, source]));
      await expect(fixture.owner.mutation(requestExport, { projectId, revisionId, requestId: `export-drift-${index}` })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
      expect((await fixture.t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(0);
      expect(await fixture.t.run(ctx => ctx.db.query('genJobs').withIndex('by_request', q => q.eq('userId', 'owner').eq('requestId', `export-drift-${index}`)).unique())).toBeNull();
    }
  });

  test('rejects unsupported layers and export clip/source limits before debit', async () => {
    const fixture = await setup();
    const ids = await Promise.all(Array.from({ length: 9 }, () => fixture.addJob()));
    const cases: Array<[string, TimelineDocument]> = [
      ['layers', { ...timeline([0, 1].map(index => ({ kind: 'job' as const, jobId: ids[index] }))), text: [{ id: 'title', text: 'No', startMs: 0, endMs: 500, x: .5, y: .5, scale: 1, opacity: 1, font: 'sans', weight: 'bold', color: '#ffffff', shadow: 'none', animation: 'none' }] }],
      ['clips', timeline(Array.from({ length: 13 }, (_, index) => ({ kind: 'job' as const, jobId: ids[index % 8] })))],
      ['sources', timeline(ids.map(jobId => ({ kind: 'job' as const, jobId })))],
    ];
    for (const [name, value] of cases) {
      const { projectId, revisionId } = await fixture.addProject(value);
      await expect(fixture.owner.mutation(requestExport, { projectId, revisionId, requestId: `export-limit-${name}` })).rejects.toThrow('UNSUPPORTED_PROJECT_EXPORT');
    }
    const valid = await fixture.addProject(timeline(ids.slice(0, 2).map(jobId => ({ kind: 'job' as const, jobId }))));
    await expect(fixture.owner.mutation(requestExport, {
      ...valid, requestId: 'export-client-profile', profile: { container: 'webm', fps: 60 },
    } as never)).rejects.toThrow();
    expect((await fixture.t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(0);
  });

  test('a request cannot reuse different project content and an exhausted failure refunds once', async () => {
    const { t, owner, addJob, addProject } = await setup();
    const ids = await Promise.all([addJob(), addJob(), addJob()]);
    const first = await addProject(timeline(ids.slice(0, 2).map(jobId => ({ kind: 'job', jobId }))));
    const second = await addProject(timeline(ids.slice(1).map(jobId => ({ kind: 'job', jobId }))));
    const admitted = await owner.mutation(requestExport, { ...first, requestId: 'export-conflict-1' });
    await expect(owner.mutation(requestExport, { ...second, requestId: 'export-conflict-1' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await t.mutation(pump, {});
      const claim = await t.mutation(claimJob, { workerSecret: 'test-secret', jobId: admitted.jobId, workerId: 'worker-123' });
      await t.mutation(failJob, { workerSecret: 'test-secret', jobId: admitted.jobId, leaseToken: claim.leaseToken, error: 'render failed' });
    }
    expect((await t.run(ctx => ctx.db.get(admitted.jobId)))?.status).toBe('failed');
    expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(0);
  });

  test('worker claim gets deduplicated private descriptors while browser job projections leak none', async () => {
    const { t, owner, addJob, addUpload, addProject } = await setup();
    const jobId = await addJob();
    const uploadId = await addUpload();
    const value = timeline([
      { kind: 'job', jobId }, { kind: 'upload', uploadId }, { kind: 'job', jobId },
    ]);
    const { projectId, revisionId } = await addProject(value);
    const admitted = await owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-claim-1' });
    await t.mutation(pump, {});
    const claim = await t.mutation(claimJob, { workerSecret: 'test-secret', jobId: admitted.jobId, workerId: 'worker-123' });
    expect(claim.timelineExport).toEqual({ profile: { container: 'mp4', fps: 30 }, timeline: value });
    expect(claim.assemblySources).toHaveLength(2);
    expect(claim.assemblySources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: { kind: 'job', jobId }, storageKey: `videos/${jobId}/source-lease.mp4`, durationMs: 5_000, width: 1920, height: 1080, hasAudio: true }),
      expect.objectContaining({ source: { kind: 'upload', uploadId }, storageUrl: expect.stringMatching(/^https?:/), durationMs: 5_000, width: 1080, height: 1920, hasAudio: false }),
    ]));

    const page = await owner.query(ref<'query'>('generate:listJobs'), { accountKey: 'owner', paginationOpts: { numItems: 20, cursor: null } });
    for (const result of [
      await owner.query(ref<'query'>('generate:getJob'), { jobId: admitted.jobId }),
      ...(await owner.query(ref<'query'>('generate:myJobs'), {})),
      ...page.page,
    ]) {
      expect(JSON.stringify(result)).not.toMatch(/storageKey|storageId|storageUrl|leaseToken|timelineExport|assemblySources|projectRevisionId|source-lease/);
    }
  });

  test('worker claim refuses metadata drift beyond a snapshotted clip boundary', async () => {
    const { t, owner, addJob, addProject } = await setup();
    const ids = await Promise.all([addJob(), addJob()]);
    const { projectId, revisionId } = await addProject(timeline(ids.map(jobId => ({ kind: 'job', jobId }))));
    const admitted = await owner.mutation(requestExport, { projectId, revisionId, requestId: 'export-claim-drift' });
    await t.mutation(pump, {});
    await t.run(ctx => ctx.db.patch(ids[1], { mediaDurationMs: 999 }));
    await expect(t.mutation(claimJob, {
      workerSecret: 'test-secret', jobId: admitted.jobId, workerId: 'worker-123',
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    expect((await t.run(ctx => ctx.db.get(admitted.jobId)))?.status).toBe('dispatched');
  });
});
