import type { Id } from '../convex/_generated/dataModel';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { normalizeTimeline, type TimelineDocument, type TimelineSource } from '../convex/timelineValues';

const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => vi.unstubAllEnvs());

const ownedCompletedJobId = 'owned-completed-job' as Id<'genJobs'>;

function singleClipTimeline(): TimelineDocument {
  return {
    version: 1,
    aspect: '16:9',
    durationMs: 3_750,
    video: [{
      id: 'clip-main',
      source: { kind: 'job', jobId: ownedCompletedJobId },
      sourceStartMs: 1_125,
      sourceEndMs: 4_875,
      timelineStartMs: 0,
      fit: 'crop',
      muted: false,
    }],
    transitions: [],
    text: [{
      id: 'title', text: '  Exact timing  ', startMs: 125, endMs: 3_625,
      x: 0.5, y: 0.25, scale: 1.25, opacity: 0.9,
      font: 'sans', weight: 'bold', color: '#a1B2c3', shadow: 'soft', animation: 'rise',
    }],
    graphics: [],
  };
}

function twoClipTimeline(): TimelineDocument {
  const timeline = singleClipTimeline();
  return {
    ...timeline,
    durationMs: 3_625,
    video: [
      { ...timeline.video[0], sourceStartMs: 1_125, sourceEndMs: 3_000 },
      {
        ...timeline.video[0], id: 'clip-second', sourceStartMs: 8_000,
        sourceEndMs: 10_125, timelineStartMs: 1_500, fit: 'fit', muted: true,
      },
    ],
    transitions: [{
      id: 'join', fromClipId: 'clip-main', toClipId: 'clip-second',
      type: 'crossfade', durationMs: 375,
    }],
  };
}

function threeClipTimeline(): TimelineDocument {
  const timeline = singleClipTimeline();
  return {
    ...timeline,
    durationMs: 4_000,
    video: [
      { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 2_000 },
      { ...timeline.video[0], id: 'clip-middle', sourceStartMs: 3_000, sourceEndMs: 5_000, timelineStartMs: 1_500 },
      { ...timeline.video[0], id: 'clip-last', sourceStartMs: 7_000, sourceEndMs: 9_000, timelineStartMs: 2_000 },
    ],
    transitions: [
      { id: 'join-first', fromClipId: 'clip-main', toClipId: 'clip-middle', type: 'crossfade', durationMs: 500 },
      { id: 'join-second', fromClipId: 'clip-middle', toClipId: 'clip-last', type: 'dip-black', durationMs: 1_500 },
    ],
    text: [],
  };
}

function hundredClipTimeline(): TimelineDocument {
  const base = singleClipTimeline();
  return {
    ...base,
    durationMs: 10_000,
    video: Array.from({ length: 100 }, (_, index) => ({
      ...base.video[0], id: `clip-${index}`, sourceStartMs: 0, sourceEndMs: 100, timelineStartMs: index * 100,
    })),
    transitions: Array.from({ length: 99 }, (_, index) => ({
      id: `transition-${index}`, fromClipId: `clip-${index}`, toClipId: `clip-${index + 1}`,
      type: 'cut' as const, durationMs: 0,
    })),
    text: [],
  };
}

function invalidTimeline(change: (timeline: TimelineDocument) => void): TimelineDocument {
  const timeline = singleClipTimeline();
  change(timeline);
  return timeline;
}

function expectInvalid(timeline: TimelineDocument) {
  expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
}

describe('timeline normalization', () => {
  test('preserves exact integer millisecond values and returns a fresh plain document', () => {
    const timeline = singleClipTimeline();

    const normalized = normalizeTimeline(timeline);

    expect(normalized).toEqual({
      ...timeline,
      text: [{ ...timeline.text[0], text: 'Exact timing' }],
    });
    expect(normalized).not.toBe(timeline);
    expect(normalized.video).not.toBe(timeline.video);
    expect(normalized.video[0]).not.toBe(timeline.video[0]);
    expect(normalized.video[0].source).not.toBe(timeline.video[0].source);
    expect(normalized.video[0]).toMatchObject({
      sourceStartMs: 1_125,
      sourceEndMs: 4_875,
      timelineStartMs: 0,
    });
  });

  test('rejects duplicate layer IDs', () => {
    const timeline = invalidTimeline(value => { value.text[0].id = value.video[0].id; });
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test('normalizes whitespace-only layer text to an empty string', () => {
    const timeline = invalidTimeline(value => { value.text[0].text = '   \n\t'; });
    expect(normalizeTimeline(timeline).text[0].text).toBe('');
  });

  test('returns isolated copies of every layer collection and nested source', () => {
    const timeline = twoClipTimeline();
    timeline.graphics = [{ ...timeline.text[0], id: 'graphic' }];

    const normalized = normalizeTimeline(timeline);

    for (const layer of ['video', 'transitions', 'text', 'graphics'] as const) {
      expect(normalized[layer]).not.toBe(timeline[layer]);
      expect(normalized[layer][0]).not.toBe(timeline[layer][0]);
    }
    expect(normalized.video[0].source).not.toBe(timeline.video[0].source);
    normalized.video[0].id = 'changed-clip';
    if (normalized.video[0].source.kind === 'job') normalized.video[0].source.jobId = 'changed-job' as Id<'genJobs'>;
    normalized.transitions[0].durationMs = 100;
    normalized.text[0].text = 'changed';
    normalized.graphics[0].x = 0;
    expect(timeline.video[0].id).toBe('clip-main');
    expect(timeline.video[0].source).toEqual({ kind: 'job', jobId: ownedCompletedJobId });
    expect(timeline.transitions[0].durationMs).toBe(375);
    expect(timeline.text[0].text).toBe('  Exact timing  ');
    expect(timeline.graphics[0].x).toBe(0.5);
  });

  test('normalizes repeated serialization to the same fresh document', () => {
    const timeline = twoClipTimeline();

    const first = normalizeTimeline(timeline);
    const second = normalizeTimeline(JSON.parse(JSON.stringify(first)) as TimelineDocument);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(second).not.toBe(first);
    expect(second.video[0]).not.toBe(first.video[0]);
    expect(second.transitions[0]).not.toBe(first.transitions[0]);
  });

  test.each([
    ['zero clips', (value: TimelineDocument) => { value.video = []; }],
    ['101 clips', (value: TimelineDocument) => {
      let timelineStartMs = 0;
      value.video = Array.from({ length: 101 }, (_, index) => {
        const durationMs = index === 100 ? 50 : 37;
        const clip = {
          ...value.video[0], id: `clip-${index}`, sourceStartMs: 0,
          sourceEndMs: durationMs, timelineStartMs,
        };
        timelineStartMs += durationMs;
        return clip;
      });
    }],
    ['a nonzero first clip start', (value: TimelineDocument) => { value.video[0].timelineStartMs = 1; }],
    ['a final duration mismatch', (value: TimelineDocument) => { value.durationMs += 1; }],
  ])('rejects %s', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test.each([
    ['fractional document duration', (value: TimelineDocument) => { value.durationMs = 3_750.5; }],
    ['fractional source start', (value: TimelineDocument) => { value.video[0].sourceStartMs = 1_125.5; }],
    ['non-finite source end', (value: TimelineDocument) => { value.video[0].sourceEndMs = Number.NaN; }],
    ['non-finite timeline start', (value: TimelineDocument) => { value.video[0].timelineStartMs = Number.POSITIVE_INFINITY; }],
    ['fractional layer start', (value: TimelineDocument) => { value.text[0].startMs = 125.5; }],
    ['non-finite layer end', (value: TimelineDocument) => { value.text[0].endMs = Number.NEGATIVE_INFINITY; }],
  ])('rejects %s', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test.each([
    ['an empty clip ID', (value: TimelineDocument) => { value.video[0].id = ''; }],
    ['an ID with invalid characters', (value: TimelineDocument) => { value.text[0].id = 'bad id!'; }],
    ['an ID longer than 64 characters', (value: TimelineDocument) => { value.text[0].id = 'a'.repeat(65); }],
    ['a malformed source ID', (value: TimelineDocument) => { (value.video[0].source as { jobId: Id<'genJobs'> }).jobId = 'bad id' as Id<'genJobs'>; }],
  ])('rejects %s', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test.each([
    ['invalid fit', (value: TimelineDocument) => { value.video[0].fit = 'stretch' as never; }],
    ['non-boolean muted', (value: TimelineDocument) => { value.video[0].muted = 'false' as never; }],
  ])('rejects %s values', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test('rejects unsupported aspects', () => {
    const timeline = invalidTimeline(value => { value.aspect = '4:3' as TimelineDocument['aspect']; });
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test.each([-1, 300_001])('rejects duration %i outside the timeline bounds', durationMs => {
    const timeline = invalidTimeline(value => { value.durationMs = durationMs; });
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test('rejects an otherwise-valid 99ms timeline', () => {
    const timeline = singleClipTimeline();
    timeline.durationMs = 99;
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 99 };
    timeline.text = [];
    timeline.graphics = [];
    expectInvalid(timeline);
  });

  test('rejects a source range whose end is not greater than its start', () => {
    const timeline = invalidTimeline(value => { value.video[0].sourceEndMs = value.video[0].sourceStartMs; });
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test('accepts a source range ending at the 300000ms product limit', () => {
    const timeline = singleClipTimeline();
    timeline.durationMs = 100;
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 299_900, sourceEndMs: 300_000 };
    timeline.text = [];
    expect(normalizeTimeline(timeline).video[0]).toMatchObject({ sourceStartMs: 299_900, sourceEndMs: 300_000 });
  });

  test.each([
    ['source start', 300_001, 300_101],
    ['source end', 299_901, 300_001],
  ])('rejects %s beyond the 300000ms product limit', (_name, sourceStartMs, sourceEndMs) => {
    const timeline = singleClipTimeline();
    timeline.durationMs = 100;
    timeline.video[0] = { ...timeline.video[0], sourceStartMs, sourceEndMs };
    timeline.text = [];
    expectInvalid(timeline);
  });

  test('accepts contiguous clips joined by cuts', () => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 4_000;
    timeline.video[1].timelineStartMs = 1_875;
    timeline.transitions[0] = { ...timeline.transitions[0], type: 'cut', durationMs: 0 };

    expect(normalizeTimeline(timeline)).toMatchObject({
      durationMs: 4_000,
      video: [{ timelineStartMs: 0 }, { timelineStartMs: 1_875 }],
    });
  });

  test('uses a 500ms crossfade as the exact adjacent clip overlap', () => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 3_500;
    timeline.text = [];
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 2_000 };
    timeline.video[1] = { ...timeline.video[1], sourceStartMs: 4_000, sourceEndMs: 6_000, timelineStartMs: 1_500 };
    timeline.transitions[0] = { ...timeline.transitions[0], durationMs: 500 };

    const normalized = normalizeTimeline(timeline);

    expect(normalized.video[1].timelineStartMs).toBe(1_500);
    expect(normalized.durationMs).toBe(3_500);
  });

  test('rejects cut timing when a crossfade is declared', () => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 4_000;
    timeline.video[1].timelineStartMs = 1_875;
    expectInvalid(timeline);
  });

  test('rejects 501ms of overlap when the declared transition is 500ms', () => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 3_499;
    timeline.text = [];
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 2_000 };
    timeline.video[1] = {
      ...timeline.video[1], sourceStartMs: 4_000, sourceEndMs: 6_000, timelineStartMs: 1_499,
    };
    timeline.transitions[0] = { ...timeline.transitions[0], durationMs: 500 };

    expectInvalid(timeline);
  });

  test('rejects overlap without a matching transition', () => {
    const timeline = twoClipTimeline();
    timeline.transitions = [];
    expectInvalid(timeline);
  });

  test('treats a missing transition as a cut', () => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 4_000;
    timeline.video[1].timelineStartMs = 1_875;
    timeline.transitions = [];

    expect(normalizeTimeline(timeline).video[1].timelineStartMs).toBe(1_875);
  });

  test.each([
    ['gap', 1_876],
    ['overlap', 1_874],
  ])('rejects a %s between clips whose boundary defaults to a cut', (_name, timelineStartMs) => {
    const timeline = twoClipTimeline();
    timeline.durationMs = 4_000;
    timeline.transitions = [];
    timeline.video[1].timelineStartMs = timelineStartMs;
    expectInvalid(timeline);
  });

  test('resolves reordered transitions by their adjacent clip pair', () => {
    const timeline = threeClipTimeline();
    timeline.durationMs = 4_500;
    timeline.video[2].timelineStartMs = 2_500;
    timeline.transitions[1] = { ...timeline.transitions[1], durationMs: 1_000 };
    timeline.transitions.reverse();

    expect(normalizeTimeline(timeline).video.map(clip => clip.timelineStartMs)).toEqual([0, 1_500, 2_500]);
  });

  test('rejects unsupported transitions', () => {
    const timeline = twoClipTimeline();
    timeline.transitions[0].type = 'wipe' as TimelineDocument['transitions'][number]['type'];
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test('rejects a transition that does not join adjacent clips', () => {
    const timeline = twoClipTimeline();
    timeline.transitions[0].fromClipId = 'clip-second';
    timeline.transitions[0].toClipId = 'clip-main';
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test('accepts 99 transitions and rejects 100', () => {
    const timeline = hundredClipTimeline();
    expect(normalizeTimeline(timeline).transitions).toHaveLength(99);
    timeline.transitions.push({ ...timeline.transitions[0], id: 'transition-99' });
    expectInvalid(timeline);
  });

  test('rejects duplicate transition pairs', () => {
    const timeline = twoClipTimeline();
    timeline.transitions.push({ ...timeline.transitions[0], id: 'duplicate-join' });
    expectInvalid(timeline);
  });

  test.each([
    ['a nonzero cut', 'cut', 1],
    ['a short non-cut transition', 'fade', 99],
    ['a long non-cut transition', 'dip-black', 2_001],
    ['a fractional non-cut transition', 'crossfade', 100.5],
  ] as const)('rejects %s', (_name, type, durationMs) => {
    const timeline = twoClipTimeline();
    timeline.transitions[0] = { ...timeline.transitions[0], type, durationMs };
    expectInvalid(timeline);
  });

  test.each([
    ['equal to the incoming clip span', 1_000],
    ['greater than the incoming clip span', 1_001],
  ])('rejects a transition duration %s', (_name, durationMs) => {
    const timeline = twoClipTimeline();
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 2_500 };
    timeline.video[1] = {
      ...timeline.video[1], sourceStartMs: 4_000, sourceEndMs: 5_000,
      timelineStartMs: 2_500 - durationMs,
    };
    timeline.durationMs = 3_500 - durationMs;
    timeline.transitions[0] = { ...timeline.transitions[0], durationMs };
    expectInvalid(timeline);
  });

  test.each([
    ['equal to the first clip span', 1_000],
    ['greater than the first clip span', 1_001],
  ])('rejects a transition duration %s while shorter than the second clip', (_name, durationMs) => {
    const timeline = twoClipTimeline();
    timeline.text = [];
    timeline.video[0] = { ...timeline.video[0], sourceStartMs: 0, sourceEndMs: 1_000 };
    timeline.video[1] = {
      ...timeline.video[1], sourceStartMs: 4_000, sourceEndMs: 6_500,
      timelineStartMs: Math.max(0, 1_000 - durationMs),
    };
    timeline.durationMs = timeline.video[1].timelineStartMs + 2_500;
    timeline.transitions[0] = { ...timeline.transitions[0], durationMs };

    expectInvalid(timeline);
  });

  test('rejects incoming and outgoing transitions that consume the middle clip', () => {
    expectInvalid(threeClipTimeline());
  });

  test('rejects text longer than 500 characters after trimming', () => {
    const timeline = invalidTimeline(value => { value.text[0].text = 'a'.repeat(501); });
    expectInvalid(timeline);
  });

  test('rejects malformed six-digit hex colors', () => {
    const timeline = invalidTimeline(value => { value.text[0].color = '#abc'; });
    expectInvalid(timeline);
  });

  test.each(['text', 'graphics'] as const)('accepts 100 %s layers and rejects 101', layer => {
    const timeline = singleClipTimeline();
    timeline.text = [];
    timeline.graphics = [];
    timeline[layer] = Array.from({ length: 100 }, (_, index) => ({
      ...singleClipTimeline().text[0], id: `${layer}-${index}`, text: `${layer} ${index}`,
    }));
    expect(normalizeTimeline(timeline)[layer]).toHaveLength(100);
    timeline[layer].push({ ...timeline[layer][0], id: `${layer}-100` });
    expectInvalid(timeline);
  });

  test.each([
    ['x below zero', (value: TimelineDocument) => { value.text[0].x = -0.001; }],
    ['x above one', (value: TimelineDocument) => { value.text[0].x = 1.001; }],
    ['y below zero', (value: TimelineDocument) => { value.text[0].y = -0.001; }],
    ['y above one', (value: TimelineDocument) => { value.text[0].y = 1.001; }],
    ['opacity below zero', (value: TimelineDocument) => { value.text[0].opacity = -0.001; }],
    ['opacity above one', (value: TimelineDocument) => { value.text[0].opacity = 1.001; }],
    ['scale below 0.1', (value: TimelineDocument) => { value.text[0].scale = 0.099; }],
    ['scale above four', (value: TimelineDocument) => { value.text[0].scale = 4.001; }],
    ['non-finite scale', (value: TimelineDocument) => { value.text[0].scale = Number.NaN; }],
  ])('rejects %s', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test.each([
    ['font', (value: TimelineDocument) => { value.text[0].font = 'display' as never; }],
    ['weight', (value: TimelineDocument) => { value.text[0].weight = 'medium' as never; }],
    ['shadow', (value: TimelineDocument) => { value.text[0].shadow = 'glow' as never; }],
    ['animation', (value: TimelineDocument) => { value.text[0].animation = 'spin' as never; }],
  ])('rejects an unsupported text %s', (_name, mutate) => {
    const timeline = singleClipTimeline();
    mutate(timeline);
    expectInvalid(timeline);
  });

  test.each(['text', 'graphics'] as const)('rejects %s layers outside the timeline duration', layer => {
    const timeline = singleClipTimeline();
    timeline[layer] = [{ ...timeline.text[0], id: `${layer}-outside`, endMs: timeline.durationMs + 1 }];
    expect(() => normalizeTimeline(timeline)).toThrow('INVALID_TIMELINE');
  });

  test.each([
    ['equal', 125, 125],
    ['reversed', 126, 125],
  ])('rejects %s text-layer ranges', (_name, startMs, endMs) => {
    const timeline = invalidTimeline(value => {
      value.text[0].startMs = startMs;
      value.text[0].endMs = endMs;
    });
    expectInvalid(timeline);
  });
});

describe('project persistence', () => {
  test('project source schema accepts exact variants and rejects malformed unions with valid IDs', async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async ctx => {
      const jobId = await ctx.db.insert('genJobs', {
        userId: 'owner', mode: 'generate', prompt: 'Source', status: 'done',
        storageKey: 'videos/source/output.mp4', createdAt: 1,
      });
      const uploadId = await ctx.db.insert('uploads', {
        userId: 'owner', name: 'source.mp4', size: 5, contentType: 'video/mp4',
        kind: 'video', status: 'ready', createdAt: 1,
      });
      const projectId = await ctx.db.insert('projects', {
        userId: 'owner', sourceJobId: jobId, name: 'Project', createdAt: 1, updatedAt: 1,
      });
      const revisionId = await ctx.db.insert('projectRevisions', {
        userId: 'owner', projectId, revision: 1, requestId: 'schema-variant', createdAt: 1,
        timeline: {
          version: 1, aspect: '16:9', durationMs: 1_000,
          video: [{ id: 'source', source: { kind: 'job', jobId }, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false }],
          transitions: [], text: [], graphics: [],
        },
      });
      return { jobId, uploadId, projectId, revisionId };
    });
    const base = { userId: 'owner', projectId: fixture.projectId, revisionId: fixture.revisionId };
    await t.run(async ctx => {
      await ctx.db.insert('projectSources', { ...base, kind: 'job', jobId: fixture.jobId });
      await ctx.db.insert('projectSources', { ...base, kind: 'upload', uploadId: fixture.uploadId });
    });

    const invalidRows = [
      { ...base, kind: 'job', jobId: fixture.jobId, uploadId: fixture.uploadId },
      { ...base, kind: 'job' },
      { ...base, kind: 'job', uploadId: fixture.uploadId },
      { ...base, kind: 'upload', jobId: fixture.jobId },
    ];
    for (const invalid of invalidRows) {
      await expect(t.run(ctx => ctx.db.insert('projectSources', invalid as never))).rejects.toThrow();
    }
    const rows = await t.run(ctx => ctx.db.query('projectSources').collect());
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.kind).sort()).toEqual(['job', 'upload']);
  });

  async function setup() {
    const t = convexTest(schema, modules);
    for (const subject of ['owner', 'other']) {
      await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: subject, credits: 0, freeUsed: 0 }));
    }
    const insertJob = (userId = 'owner', patch: Record<string, unknown> = {}) => t.run(ctx => ctx.db.insert('genJobs', {
      userId, mode: 'generate', prompt: '  A project name with clean edges  ', aspect: '16:9',
      status: 'done', storageKey: 'videos/output.mp4', createdAt: 1, ...patch,
    }));
    return {
      t,
      owner: t.withIdentity({ subject: 'owner' }),
      other: t.withIdentity({ subject: 'other' }),
      insertJob,
    };
  }

  async function expectUnavailableSave(createSource: (fixture: Awaited<ReturnType<typeof setup>>) => Promise<TimelineSource>) {
    const fixture = await setup();
    const sourceJobId = await fixture.insertJob();
    const project = await fixture.owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 2_000, requestId: 'source-guard-create',
    });
    const source = await createSource(fixture);
    const timeline: TimelineDocument = {
      ...project.timeline,
      video: [
        { ...project.timeline.video[0], sourceEndMs: 1_000 },
        { ...project.timeline.video[0], id: 'guarded-source', source, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 1_000 },
      ],
    };

    await expect(fixture.owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'source-guard-save', timeline,
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    expect(await fixture.t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(1);
    expect(await fixture.t.run(ctx => ctx.db.query('projectSources').collect())).toHaveLength(1);
    expect((await fixture.owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' })).activeRevisionId).toBe(project.activeRevisionId);
  }

  test('creates one owner project from a completed output and leaves its initial timeline unchanged on later creates', async () => {
    const { t, owner, other, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const create = (durationMs: number, requestId: string) => owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs, requestId });

    const first = await create(3_750, 'project-create-1');
    expect(first).toEqual({
      projectId: expect.any(String), name: 'A project name with clean edges', activeRevisionId: expect.any(String),
      revision: 1, updatedAt: expect.any(Number),
      timeline: {
        version: 1, aspect: '16:9', durationMs: 3_750,
        video: [{ id: `source-${sourceJobId}`, source: { kind: 'job', jobId: sourceJobId }, sourceStartMs: 0, sourceEndMs: 3_750, timelineStartMs: 0, fit: 'crop', muted: false }],
        transitions: [], text: [], graphics: [],
      },
    });
    expect(await create(9_000, 'project-create-later')).toEqual(first);
    expect(await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' })).toEqual(first);
    expect(await other.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' })).toBeNull();
    expect(await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'other' })).toBeNull();
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toEqual([
      expect.objectContaining({
        userId: 'owner', projectId: first.projectId, revisionId: first.activeRevisionId,
        kind: 'job', jobId: sourceJobId,
      }),
    ]);
  });

  test('writes one immutable relation per unique revision source and exact retries add none', async () => {
    const { t, owner, insertJob } = await setup();
    const firstJobId = await insertJob();
    const secondJobId = await insertJob('owner', { prompt: 'Second source' });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(['video'], { type: 'video/mp4' })));
    const uploadId = await t.run(ctx => ctx.db.insert('uploads', {
      userId: 'owner', name: 'source.mp4', size: 5, contentType: 'video/mp4', kind: 'video',
      status: 'ready', storageId, createdAt: 1, mediaDurationMs: 3_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true,
    }));
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId: firstJobId, durationMs: 3_000, requestId: 'relations-create',
    });
    const timeline: TimelineDocument = {
      ...project.timeline, durationMs: 3_000,
      video: [
        { ...project.timeline.video[0], sourceEndMs: 1_000 },
        { ...project.timeline.video[0], id: 'first-repeated', sourceStartMs: 1_000, sourceEndMs: 2_000, timelineStartMs: 1_000 },
        { ...project.timeline.video[0], id: 'second-job', source: { kind: 'job', jobId: secondJobId }, sourceStartMs: 0, sourceEndMs: 500, timelineStartMs: 2_000 },
        { ...project.timeline.video[0], id: 'upload', source: { kind: 'upload', uploadId }, sourceStartMs: 0, sourceEndMs: 500, timelineStartMs: 2_500 },
      ],
    };
    const save = () => owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'relations-save', timeline,
    });

    const saved = await save();
    await expect(save()).resolves.toEqual(saved);
    const rows = await t.run(ctx => ctx.db.query('projectSources').collect());
    expect(rows.every(row => (row.jobId !== undefined) !== (row.uploadId !== undefined))).toBe(true);
    expect(rows.filter(row => row.revisionId === project.activeRevisionId)).toHaveLength(1);
    expect(rows.filter(row => row.revisionId === saved.activeRevisionId).map(row =>
      row.kind === 'job' ? `job:${row.jobId}` : `upload:${row.uploadId}`,
    ).sort()).toEqual([`job:${firstJobId}`, `job:${secondJobId}`, `upload:${uploadId}`].sort());
    expect(rows).toHaveLength(4);
  });

  test.each([100, 300_000])('accepts the inclusive browser duration boundary %i', async durationMs => {
    const { owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    expect((await owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs, requestId: `duration-${durationMs}` })).timeline.durationMs).toBe(durationMs);
  });

  test('trims and bounds source names with an untitled fallback', async () => {
    const { owner, insertJob } = await setup();
    const longSource = await insertJob('owner', { prompt: `  ${'x'.repeat(90)}  ` });
    const untitledSource = await insertJob('owner', { prompt: '   ' });
    const create = (sourceJobId: Id<'genJobs'>, requestId: string) => owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 1_000, requestId });
    expect((await create(longSource, 'long-project-name')).name).toBe('x'.repeat(80));
    expect((await create(untitledSource, 'untitled-project-name')).name).toBe('Untitled project');
  });

  test.each([99, 300_001, 1_000.5, Number.NaN])('rejects invalid browser duration %s without writing', async durationMs => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    await expect(owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs, requestId: 'invalid-duration' })).rejects.toThrow('INVALID_TIMELINE');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toEqual([]);
  });

  test('rejects queued, failed, missing-output, missing and foreign source jobs', async () => {
    const { t, owner, insertJob } = await setup();
    const sources = [
      await insertJob('owner', { status: 'queued' }),
      await insertJob('owner', { status: 'failed' }),
      await insertJob('owner', { storageKey: undefined }),
      await insertJob('other'),
      await insertJob(),
    ];
    await t.run(ctx => ctx.db.delete(sources[4]));
    for (const [index, sourceJobId] of sources.entries()) {
      await expect(owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 1_000, requestId: `unavailable-${index}` })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    }
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
  });

  test('saves only from the active parent, retries normalized content, and rejects stale or changed requests without writes', async () => {
    const { t, owner, other, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 3_750, requestId: 'project-create-2' });
    const timeline = { ...project.timeline, text: [{
      id: 'title', text: '  Saved title  ', startMs: 0, endMs: 3_750, x: 0.5, y: 0.2,
      scale: 1, opacity: 1, font: 'sans', weight: 'bold', color: '#FFFFFF', shadow: 'soft', animation: 'fade',
    }] } as TimelineDocument;
    const save = (args: Record<string, unknown>) => owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId, requestId: 'project-save-1', timeline, ...args,
    });

    const second = await save({});
    expect(second).toMatchObject({ projectId: project.projectId, revision: 2, timeline: { text: [{ text: 'Saved title' }] } });
    expect(await save({ timeline: { ...timeline, text: [{ ...timeline.text[0], text: 'Saved title' }] } })).toEqual(second);
    await expect(save({ timeline: { ...timeline, text: [{ ...timeline.text[0], text: 'Changed title' }] } })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
    await expect(save({ requestId: 'project-save-stale', timeline: project.timeline })).rejects.toThrow('PROJECT_REVISION_CONFLICT');
    await expect(other.mutation(ref<'mutation'>('projects:saveRevision'), { projectId: project.projectId, parentRevisionId: second.activeRevisionId, requestId: 'foreign-save-1', timeline })).rejects.toThrow('PROJECT_NOT_FOUND');
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(2);
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toHaveLength(2);
  });

  test('failed source and stale saves write no source relations', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const unavailableJobId = await insertJob('owner', { status: 'failed' });
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'no-relations-create',
    });
    const badTimeline: TimelineDocument = {
      ...project.timeline,
      video: [{ ...project.timeline.video[0], source: { kind: 'job', jobId: unavailableJobId } }],
    };
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'no-relations-source', timeline: badTimeline,
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    await t.run(ctx => ctx.db.patch(project.activeRevisionId, { revision: 1_000 }));
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'no-relations-limit', timeline: project.timeline,
    })).rejects.toThrow('PROJECT_REVISION_LIMIT');
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toHaveLength(1);
  });

  test('trusted metadata accepts exact EOF, rejects one millisecond beyond it, and missing metadata remains compatible', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob('owner', { mediaDurationMs: 1_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true });
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'trusted-bounds-create',
    });
    expect(project.timeline.video[0].sourceEndMs).toBe(1_000);
    const beyond = { ...project.timeline, video: [{ ...project.timeline.video[0], sourceEndMs: 1_001 }], durationMs: 1_001 };
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'trusted-bounds-save', timeline: beyond,
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');

    const legacyJobId = await insertJob('owner', { prompt: 'Legacy source' });
    const legacyProject = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId: legacyJobId, durationMs: 1_001, requestId: 'legacy-bounds-create',
    });
    expect(legacyProject.timeline.video[0].sourceEndMs).toBe(1_001);
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toHaveLength(2);
  });

  test('project clients cannot write trusted source metadata', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    await expect(owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'client-metadata', mediaDurationMs: 1_000,
    } as never)).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toEqual([]);
  });

  test('binds a request retry to its original parent after the active revision advances', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'ancestry-create',
    });
    const timeline = { ...project.timeline, video: [{ ...project.timeline.video[0], muted: true }] };
    const second = await owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'ancestry-save', timeline,
    });

    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: second.activeRevisionId,
      requestId: 'ancestry-save', timeline,
    })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(2);
  });

  test('rejects a save after revision 1000 without writing', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'revision-limit-create',
    });
    await t.run(ctx => ctx.db.patch(project.activeRevisionId, { revision: 1_000 }));
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: 'revision-limit-save', timeline: project.timeline,
    })).rejects.toThrow('PROJECT_REVISION_LIMIT');
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(1);
  });

  test.each(['', '1234567', 'bad request', 'x'.repeat(101)])('rejects invalid create request ID %j before writing', async requestId => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    await expect(owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId,
    })).rejects.toThrow('INVALID_REQUEST_ID');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toEqual([]);
  });

  test.each(['', '1234567', 'bad request', 'x'.repeat(101)])('rejects invalid save request ID %j before writing', async requestId => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), {
      sourceJobId, durationMs: 1_000, requestId: 'request-save-create',
    });
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId, timeline: project.timeline,
    })).rejects.toThrow('INVALID_REQUEST_ID');
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(1);
  });

  test.each(['12345678', 'x'.repeat(100)])('accepts valid request ID boundary %j', async requestId => {
    const { owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 1_000, requestId });
    expect((await owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId,
      requestId: requestId === '12345678' ? 'abcdefgh' : 'y'.repeat(100), timeline: project.timeline,
    })).revision).toBe(2);
  });

  test('requires every job and upload timeline source to be owned and ready', async () => {
    const { t, owner, insertJob } = await setup();
    const sourceJobId = await insertJob();
    const secondJobId = await insertJob('owner', { prompt: 'Second source' });
    const foreignJobId = await insertJob('other', { prompt: 'Foreign source' });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(['video'], { type: 'video/mp4' })));
    const ownedUploadId = await t.run(ctx => ctx.db.insert('uploads', { userId: 'owner', name: 'owned.mp4', size: 5, contentType: 'video/mp4', kind: 'video', status: 'ready', storageId, createdAt: 1, mediaDurationMs: 2_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true }));
    const foreignUploadId = await t.run(ctx => ctx.db.insert('uploads', { userId: 'other', name: 'foreign.mp4', size: 5, contentType: 'video/mp4', kind: 'video', status: 'ready', storageId, createdAt: 1, mediaDurationMs: 2_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true }));
    const project = await owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 2_000, requestId: 'project-create-3' });
    const timelineFor = (source: TimelineDocument['video'][number]['source']): TimelineDocument => ({
      ...project.timeline,
      video: [
        { ...project.timeline.video[0], sourceEndMs: 1_000 },
        { ...project.timeline.video[0], id: 'second', source, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 1_000 },
      ],
    });
    const save = (source: TimelineDocument['video'][number]['source'], requestId: string) => owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: project.activeRevisionId, requestId, timeline: timelineFor(source),
    });

    expect((await save({ kind: 'job', jobId: secondJobId }, 'valid-job-source')).revision).toBe(2);
    const latest = await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' });
    expect((await owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: project.projectId, parentRevisionId: latest.activeRevisionId, requestId: 'valid-upload-source', timeline: timelineFor({ kind: 'upload', uploadId: ownedUploadId }),
    })).revision).toBe(3);

    for (const [requestId, source] of [
      ['foreign-job-source', { kind: 'job', jobId: foreignJobId }],
      ['foreign-upload-source', { kind: 'upload', uploadId: foreignUploadId }],
    ] as const) {
      const active = await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' });
      await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), { projectId: project.projectId, parentRevisionId: active.activeRevisionId, requestId, timeline: timelineFor(source) })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    }
    await t.run(ctx => ctx.db.patch(secondJobId, { status: 'failed' }));
    const active = await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' });
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), { projectId: project.projectId, parentRevisionId: active.activeRevisionId, requestId: 'failed-job-source', timeline: timelineFor({ kind: 'job', jobId: secondJobId }) })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    await t.run(ctx => ctx.db.patch(ownedUploadId, { status: 'pending' }));
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), { projectId: project.projectId, parentRevisionId: active.activeRevisionId, requestId: 'pending-upload-source', timeline: timelineFor({ kind: 'upload', uploadId: ownedUploadId }) })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(3);
  });

  test('rejects an owned ready audio upload with storage', async () => {
    await expectUnavailableSave(async ({ t }) => {
      const storageId = await t.run(ctx => ctx.storage.store(new Blob(['audio'], { type: 'audio/mpeg' })));
      const uploadId = await t.run(ctx => ctx.db.insert('uploads', {
        userId: 'owner', name: 'track.mp3', size: 5, contentType: 'audio/mpeg', kind: 'audio',
        status: 'ready', storageId, createdAt: 1,
      }));
      return { kind: 'upload', uploadId };
    });
  });

  test('rejects an owned completed job without an output storage key', async () => {
    await expectUnavailableSave(async ({ insertJob }) => ({
      kind: 'job', jobId: await insertJob('owner', { prompt: 'Missing output', storageKey: undefined }),
    }));
  });

  test('rejects an owned ready video upload without a storage ID', async () => {
    await expectUnavailableSave(async ({ t }) => {
      const uploadId = await t.run(ctx => ctx.db.insert('uploads', {
        userId: 'owner', name: 'missing.mp4', size: 5, contentType: 'video/mp4', kind: 'video',
        status: 'ready', createdAt: 1,
      }));
      return { kind: 'upload', uploadId };
    });
  });

  test('rejects an owned ready video upload without trusted metadata', async () => {
    await expectUnavailableSave(async ({ t }) => {
      const storageId = await t.run(ctx => ctx.storage.store(new Blob(['video'], { type: 'video/mp4' })));
      const uploadId = await t.run(ctx => ctx.db.insert('uploads', {
        userId: 'owner', name: 'legacy.mp4', size: 5, contentType: 'video/mp4', kind: 'video',
        status: 'ready', storageId, createdAt: 1,
      }));
      return { kind: 'upload', uploadId };
    });
  });

  test('rejects a deleted referenced job', async () => {
    await expectUnavailableSave(async ({ t, insertJob }) => {
      const jobId = await insertJob('owner', { prompt: 'Deleted source' });
      await t.run(ctx => ctx.db.delete(jobId));
      return { kind: 'job', jobId };
    });
  });

  test('rejects a deleted referenced upload', async () => {
    await expectUnavailableSave(async ({ t }) => {
      const uploadId = await t.run(ctx => ctx.db.insert('uploads', {
        userId: 'owner', name: 'deleted.mp4', size: 5, contentType: 'video/mp4', kind: 'video',
        status: 'ready', createdAt: 1,
      }));
      await t.run(ctx => ctx.db.delete(uploadId));
      return { kind: 'upload', uploadId };
    });
  });

  test('returns an exact public projection without job or storage internals', async () => {
    const { owner, insertJob } = await setup();
    const sourceJobId = await insertJob('owner', {
      leaseToken: 'private-lease', sourceStorageKey: 'private-source', error: 'private-error',
      mediaDurationMs: 1_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true,
    });
    await owner.mutation(ref<'mutation'>('projects:createFromJob'), { sourceJobId, durationMs: 1_000, requestId: 'project-create-4' });
    const result = await owner.query(ref<'query'>('projects:forSource'), { sourceJobId, accountKey: 'owner' });
    expect(Object.keys(result).sort()).toEqual(['activeRevisionId', 'name', 'projectId', 'revision', 'timeline', 'updatedAt']);
    expect(JSON.stringify(result)).not.toMatch(/storageKey|leaseToken|private-error|prompt|status|mediaDuration|mediaWidth|mediaHeight|mediaHasAudio/);
  });
});

describe('assembly project creation', () => {
  async function setupAssembly() {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 4, freeUsed: 1 });
      await ctx.db.insert('users', { tokenIdentifier: 'other', credits: 2, freeUsed: 0 });
    });
    const addJob = (userId: string, label: string, durationMs: number, patch: Record<string, unknown> = {}) =>
      t.run(ctx => ctx.db.insert('genJobs', {
        userId, mode: 'generate', prompt: label, aspect: '16:9', status: 'done',
        storageKey: `private/${label}.mp4`, createdAt: durationMs,
        mediaDurationMs: durationMs, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true,
        ...patch,
      }));
    const addUpload = async (userId: string, label: string, durationMs: number, patch: Record<string, unknown> = {}) => {
      const storageId = await t.run(ctx => ctx.storage.store(new Blob([label], { type: 'video/mp4' })));
      return t.run(ctx => ctx.db.insert('uploads', {
        userId, name: label, size: label.length, contentType: 'video/mp4', kind: 'video',
        status: 'ready', storageId, createdAt: durationMs,
        mediaDurationMs: durationMs, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: false,
        ...patch,
      }));
    };
    return { t, owner: t.withIdentity({ subject: 'owner' }), other: t.withIdentity({ subject: 'other' }), addJob, addUpload };
  }

  test('creates a deterministic cut-only draft from ordered trusted sources without billing or enqueueing', async () => {
    const { t, owner, addJob, addUpload } = await setupAssembly();
    const jobId = await addJob('owner', 'Opening shot', 5_000);
    const uploadId = await addUpload('owner', 'product-closeup.mp4', 5_000);
    const before = await t.run(async ctx => ({
      user: await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique(),
      jobs: await ctx.db.query('genJobs').collect(),
      generations: await ctx.db.query('generations').collect(),
    }));

    const result = await owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      name: '  Launch montage  ', requestId: 'assembly-create-1', confirmedOwnership: true,
      aspect: '9:16', fit: 'fit', preserveAudio: false, targetDurationMs: 7_501,
      sources: [{ kind: 'upload', uploadId }, { kind: 'job', jobId }],
    });

    expect(result).toMatchObject({ name: 'Launch montage', revision: 1, timeline: {
      version: 1, aspect: '9:16', durationMs: 7_501, transitions: [], text: [], graphics: [],
      video: [
        { id: 'clip-001', source: { kind: 'upload', uploadId }, sourceStartMs: 0, sourceEndMs: 3_751, timelineStartMs: 0, fit: 'fit', muted: true },
        { id: 'clip-002', source: { kind: 'job', jobId }, sourceStartMs: 0, sourceEndMs: 3_750, timelineStartMs: 3_751, fit: 'fit', muted: true },
      ],
    } });
    const state = await t.run(async ctx => ({
      user: await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique(),
      jobs: await ctx.db.query('genJobs').collect(), generations: await ctx.db.query('generations').collect(),
      revisions: await ctx.db.query('projectRevisions').collect(), sources: await ctx.db.query('projectSources').collect(),
    }));
    expect(state.user).toMatchObject({ credits: before.user?.credits, freeUsed: before.user?.freeUsed });
    expect(state.jobs).toEqual(before.jobs);
    expect(state.generations).toEqual(before.generations);
    expect(state.revisions).toHaveLength(1);
    expect(state.sources.map(row => row.kind === 'job' ? `job:${row.jobId}` : `upload:${row.uploadId}`).sort())
      .toEqual([`job:${jobId}`, `upload:${uploadId}`].sort());
  });

  test('retries identical assembly creation and rejects changed content for the same request', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const firstJobId = await addJob('owner', 'First', 5_000);
    const secondJobId = await addJob('owner', 'Second', 5_000);
    const args = {
      name: 'Assembly', requestId: 'assembly-retry-1', confirmedOwnership: true,
      aspect: '16:9' as const, fit: 'crop' as const, preserveAudio: true, targetDurationMs: 4_000,
      sources: [{ kind: 'job' as const, jobId: firstJobId }, { kind: 'job' as const, jobId: secondJobId }],
    };
    const first = await owner.mutation(ref<'mutation'>('projects:createAssembly'), args);
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...args, name: '  Assembly  ' })).resolves.toEqual(first);
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...args, fit: 'fit' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query('projectRevisions').collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query('projectSources').collect())).toHaveLength(2);
  });

  test('redistributes an equal draft allocation around a short source and writes one relation per unique source', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const shortJobId = await addJob('owner', 'Short', 1_000);
    const longJobId = await addJob('owner', 'Long', 9_000);
    const result = await owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      name: 'Balanced', requestId: 'assembly-balanced-1', confirmedOwnership: true,
      aspect: '16:9', fit: 'crop', preserveAudio: true, targetDurationMs: 8_000,
      sources: [
        { kind: 'job', jobId: shortJobId }, { kind: 'job', jobId: longJobId },
        { kind: 'job', jobId: longJobId },
      ],
    });
    expect(result.timeline.video.map((clip: TimelineDocument['video'][number]) => ({
      end: clip.sourceEndMs, start: clip.timelineStartMs,
    }))).toEqual([{ end: 1_000, start: 0 }, { end: 3_500, start: 1_000 }, { end: 3_500, start: 4_500 }]);
    const relations = await t.run(ctx => ctx.db.query('projectSources').collect());
    expect(relations).toHaveLength(2);
    expect(new Set(relations.map(row => row.jobId))).toEqual(new Set([shortJobId, longJobId]));
  });

  test('requires auth, a user row, rights confirmation, bounded names and two to twelve selections', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const one = await addJob('owner', 'One', 1_000);
    const two = await addJob('owner', 'Two', 1_000);
    const valid = { name: 'Assembly', requestId: 'assembly-guard-1', confirmedOwnership: true, aspect: '1:1' as const, fit: 'crop' as const, preserveAudio: true, targetDurationMs: 1_000, sources: [{ kind: 'job' as const, jobId: one }, { kind: 'job' as const, jobId: two }] };
    await expect(t.mutation(ref<'mutation'>('projects:createAssembly'), valid)).rejects.toThrow('UNAUTHENTICATED');
    await expect(t.withIdentity({ subject: 'missing' }).mutation(ref<'mutation'>('projects:createAssembly'), valid)).rejects.toThrow('NO_USER');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...valid, confirmedOwnership: false })).rejects.toThrow('CONFIRM_VIDEO_RIGHTS');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...valid, name: 'x'.repeat(81) })).rejects.toThrow('INVALID_PROJECT_NAME');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...valid, sources: [valid.sources[0]] })).rejects.toThrow('INVALID_ASSEMBLY_SOURCES');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...valid, sources: Array.from({ length: 13 }, () => valid.sources[0]) })).rejects.toThrow('INVALID_ASSEMBLY_SOURCES');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
  });

  test('rejects more than eight unique sources and durations that cannot be allocated across every clip', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const ids = await Promise.all(Array.from({ length: 9 }, (_, index) => addJob('owner', `Source ${index}`, 1_000)));
    const base = { name: 'Assembly', requestId: 'assembly-limits-1', confirmedOwnership: true, aspect: '16:9' as const, fit: 'crop' as const, preserveAudio: true };
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...base, targetDurationMs: 900, sources: ids.map(jobId => ({ kind: 'job' as const, jobId })) })).rejects.toThrow('TOO_MANY_ASSEMBLY_SOURCES');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...base, requestId: 'assembly-too-long', targetDurationMs: 300_001, sources: ids.slice(0, 2).map(jobId => ({ kind: 'job' as const, jobId })) })).rejects.toThrow('INVALID_ASSEMBLY_DURATION');
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), { ...base, requestId: 'assembly-infeasible', targetDurationMs: 2_001, sources: ids.slice(0, 2).map(jobId => ({ kind: 'job' as const, jobId })) })).rejects.toThrow('ASSEMBLY_DURATION_UNAVAILABLE');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
  });

  test('requires and accepts exactly one hundred milliseconds per selected clip', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const ids = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      addJob('owner', `Boundary ${index}`, 100)));
    const sources = Array.from({ length: 12 }, (_, index) => ({ kind: 'job' as const, jobId: ids[index % ids.length] }));
    const base = {
      name: 'Frame-safe assembly', confirmedOwnership: true,
      aspect: '16:9' as const, fit: 'crop' as const, preserveAudio: true, sources,
    };
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      ...base, requestId: 'assembly-below-minimum', targetDurationMs: 1_199,
    })).rejects.toThrow('ASSEMBLY_DURATION_UNAVAILABLE');
    const accepted = await owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      ...base, requestId: 'assembly-exact-minimum', targetDurationMs: 1_200,
    });
    expect(accepted.timeline.video).toHaveLength(12);
    expect(accepted.timeline.video.map((clip: TimelineDocument['video'][number]) => clip.sourceEndMs - clip.sourceStartMs))
      .toEqual(Array(12).fill(100));
    expect(accepted.timeline.video.map((clip: TimelineDocument['video'][number]) => clip.timelineStartMs))
      .toEqual(Array.from({ length: 12 }, (_, index) => index * 100));
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toHaveLength(1);
  });

  test('rejects a source shorter than the per-clip minimum before writing', async () => {
    const { t, owner, addJob } = await setupAssembly();
    const valid = await addJob('owner', 'Valid', 1_000);
    const tooShort = await addJob('owner', 'Too short', 99, { mediaDurationMs: 99 });
    await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      name: 'Short source', requestId: 'assembly-short-source', confirmedOwnership: true,
      aspect: '9:16', fit: 'fit', preserveAudio: false, targetDurationMs: 200,
      sources: [{ kind: 'job', jobId: valid }, { kind: 'job', jobId: tooShort }],
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
  });

  test('rejects foreign, unavailable, deleted, audio and untrusted sources before writing', async () => {
    const { t, owner, addJob, addUpload } = await setupAssembly();
    const valid = await addJob('owner', 'Valid', 2_000);
    const candidates = [
      await addJob('other', 'Foreign', 2_000),
      await addJob('owner', 'Queued', 2_000, { status: 'queued' }),
      await addJob('owner', 'No output', 2_000, { storageKey: undefined }),
      await addJob('owner', 'No metadata', 2_000, { mediaDurationMs: undefined }),
      await addUpload('other', 'foreign.mp4', 2_000),
      await addUpload('owner', 'pending.mp4', 2_000, { status: 'pending' }),
      await addUpload('owner', 'audio.mp4', 2_000, { kind: 'audio' }),
      await addUpload('owner', 'untrusted.mp4', 2_000, { mediaWidth: undefined }),
    ];
    const deleted = await addJob('owner', 'Deleted', 2_000);
    await t.run(ctx => ctx.db.delete(deleted));
    candidates.push(deleted);
    for (const [index, sourceId] of candidates.entries()) {
      const source = index < 4 || index === 8 ? { kind: 'job' as const, jobId: sourceId as Id<'genJobs'> } : { kind: 'upload' as const, uploadId: sourceId as Id<'uploads'> };
      await expect(owner.mutation(ref<'mutation'>('projects:createAssembly'), {
        name: 'Guard', requestId: `assembly-source-${index}`, confirmedOwnership: true,
        aspect: '9:16', fit: 'crop', preserveAudio: true, targetDurationMs: 1_000,
        sources: [{ kind: 'job', jobId: valid }, source],
      })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    }
    expect(await t.run(ctx => ctx.db.query('projects').collect())).toEqual([]);
  });

  test('lists only owned trusted sources with an exact privacy-safe projection', async () => {
    const { t, owner, other, addJob, addUpload } = await setupAssembly();
    const jobId = await addJob('owner', '  Safe generated label  ', 3_000, { leaseToken: 'private-lease', error: 'private-error', sourceStorageKey: 'private-source' });
    const uploadId = await addUpload('owner', 'safe-upload.mp4', 4_000, { probeToken: 'private-probe', probeError: 'private-error' });
    await addJob('other', 'Foreign', 5_000);
    await addJob('owner', 'Untrusted', 5_000, { mediaHeight: undefined });
    await addUpload('owner', 'not-ready.mp4', 5_000, { status: 'preparing' });

    const result = await owner.query(ref<'query'>('projects:listSources'), { accountKey: 'owner' });
    expect(result).toEqual([
      { source: { kind: 'upload', uploadId }, label: 'safe-upload.mp4', durationMs: 4_000, width: 1080, height: 1920, hasAudio: false },
      { source: { kind: 'job', jobId }, label: 'Safe generated label', durationMs: 3_000, width: 1920, height: 1080, hasAudio: true },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/storage|lease|provider|private|error|status|token/i);
    await expect(t.query(ref<'query'>('projects:listSources'), { accountKey: 'owner' })).rejects.toThrow('UNAUTHENTICATED');
    await expect(other.query(ref<'query'>('projects:listSources'), { accountKey: 'owner' })).resolves.toEqual([]);
    await expect(owner.query(ref<'query'>('projects:listSources'), { accountKey: 'other' })).resolves.toEqual([]);
  });

  test('gets only the owner project through an account-key fence and exposes exact safe fields', async () => {
    const { t, owner, other, addJob } = await setupAssembly();
    const first = await addJob('owner', 'First', 2_000);
    const second = await addJob('owner', 'Second', 2_000);
    const created = await owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      name: 'Private assembly', requestId: 'assembly-get-1', confirmedOwnership: true,
      aspect: '16:9', fit: 'crop', preserveAudio: true, targetDurationMs: 2_000,
      sources: [{ kind: 'job', jobId: first }, { kind: 'job', jobId: second }],
    });
    const view = await owner.query(ref<'query'>('projects:get'), { projectId: created.projectId, accountKey: 'owner' });
    expect(view).toEqual(created);
    expect(Object.keys(view).sort()).toEqual(['activeRevisionId', 'name', 'projectId', 'revision', 'timeline', 'updatedAt']);
    expect(JSON.stringify(view)).not.toMatch(/storage|lease|provider|error|status|prompt|createFingerprint/i);
    const descriptors = await owner.query(ref<'query'>('projects:sourcesForRevision'), {
      projectId: created.projectId, revisionId: created.activeRevisionId, accountKey: 'owner',
    });
    expect(descriptors).toEqual([
      { source: { kind: 'job', jobId: first }, label: 'First', durationMs: 2_000, width: 1920, height: 1080, hasAudio: true },
      { source: { kind: 'job', jobId: second }, label: 'Second', durationMs: 2_000, width: 1920, height: 1080, hasAudio: true },
    ]);
    expect(JSON.stringify(descriptors)).not.toMatch(/storage|status|createdAt|token|private/i);
    await expect(t.query(ref<'query'>('projects:sourcesForRevision'), { projectId: created.projectId, revisionId: created.activeRevisionId, accountKey: 'owner' })).rejects.toThrow('UNAUTHENTICATED');
    await expect(other.query(ref<'query'>('projects:sourcesForRevision'), { projectId: created.projectId, revisionId: created.activeRevisionId, accountKey: 'owner' })).resolves.toEqual([]);
    await expect(owner.query(ref<'query'>('projects:sourcesForRevision'), { projectId: created.projectId, revisionId: created.activeRevisionId, accountKey: 'other' })).resolves.toEqual([]);
    await expect(t.query(ref<'query'>('projects:get'), { projectId: created.projectId, accountKey: 'owner' })).rejects.toThrow('UNAUTHENTICATED');
    await expect(other.query(ref<'query'>('projects:get'), { projectId: created.projectId, accountKey: 'owner' })).resolves.toBeNull();
    await expect(owner.query(ref<'query'>('projects:get'), { projectId: created.projectId, accountKey: 'other' })).resolves.toBeNull();
  });

  test('keeps later assembly revisions on trusted media with exact source bounds', async () => {
    const { owner, addJob } = await setupAssembly();
    const first = await addJob('owner', 'First', 1_000);
    const second = await addJob('owner', 'Second', 1_000);
    const untrusted = await addJob('owner', 'Legacy output', 1_000, { mediaDurationMs: undefined });
    const created = await owner.mutation(ref<'mutation'>('projects:createAssembly'), {
      name: 'Strict assembly', requestId: 'assembly-strict-1', confirmedOwnership: true,
      aspect: '16:9', fit: 'crop', preserveAudio: true, targetDurationMs: 1_000,
      sources: [{ kind: 'job', jobId: first }, { kind: 'job', jobId: second }],
    });
    const untrustedTimeline: TimelineDocument = {
      ...created.timeline,
      video: [created.timeline.video[0], { ...created.timeline.video[1], source: { kind: 'job', jobId: untrusted } }],
    };
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: created.projectId, parentRevisionId: created.activeRevisionId,
      requestId: 'assembly-strict-save', timeline: untrustedTimeline,
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
    const beyondTimeline: TimelineDocument = {
      ...created.timeline, durationMs: 1_501,
      video: [
        { ...created.timeline.video[0], sourceEndMs: 1_001 },
        { ...created.timeline.video[1], timelineStartMs: 1_001 },
      ],
    };
    await expect(owner.mutation(ref<'mutation'>('projects:saveRevision'), {
      projectId: created.projectId, parentRevisionId: created.activeRevisionId,
      requestId: 'assembly-bounds-save', timeline: beyondTimeline,
    })).rejects.toThrow('PROJECT_SOURCE_UNAVAILABLE');
  });
});
