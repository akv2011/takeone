# Project timeline foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-scoped project and immutable timeline revision contract, then expose its state inside the existing professional Studio without changing rendering or billing.

**Architecture:** Convex stores one project per completed source job and immutable child revisions. A pure normalizer validates the bounded timeline before persistence. The Studio creates the initial single-clip project only after the owned video has loaded its duration, then shows the active revision in the existing Project panel. This slice does not export a timeline or charge an allowance.

**Tech stack:** TypeScript, Convex, React 19, Vitest, Testing Library

---

## File structure

- Create `convex/timelineValues.ts` for timeline validators, types, and pure normalization.
- Create `convex/projects.ts` for owner-scoped project creation, reads, and immutable revision saves.
- Modify `convex/schema.ts` to add `projects` and `projectRevisions` tables and indexes.
- Modify `src/lib/convexApi.ts` to expose the project functions.
- Create `src/components/ProjectTimelinePanel.tsx` for project creation and active revision state.
- Modify `src/pages/Studio.tsx` to mount the panel in the existing Project region.
- Create `tests/projects.test.ts` for data ownership, idempotency, and revision conflicts.
- Create `tests/project-timeline-panel.test.tsx` for browser behavior and account/source fencing.

### Task 1: Define and test the timeline contract

**Files:**
- Create: `convex/timelineValues.ts`
- Test: `tests/projects.test.ts`

- [x] **Step 1: Write failing normalization tests**

Add tests that build a version-1 timeline with one owned completed-job clip and assert that normalization preserves exact millisecond values. Add failures for duplicate layer IDs, an invalid aspect, negative or over-five-minute duration, a source range whose end is not greater than its start, a gap or overlap between video clips, unsupported transitions, a transition that does not join adjacent clips, and text/graphic layers outside the timeline duration.

- [x] **Step 2: Run the targeted test and confirm the missing module failure**

Run: `npm test -- tests/projects.test.ts`

Expected: FAIL because `convex/timelineValues.ts` does not exist.

- [x] **Step 3: Implement the version-1 contract**

Export Convex validators and matching TypeScript types for:

```ts
type TimelineSource =
  | { kind: "job"; jobId: Id<"genJobs"> }
  | { kind: "upload"; uploadId: Id<"uploads"> };

type VideoClip = {
  id: string;
  source: TimelineSource;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  fit: "crop" | "fit";
  muted: boolean;
};

type TimelineTransition = {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: "cut" | "crossfade" | "fade" | "dip-black";
  durationMs: number;
};

type TimelineTextLayer = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  font: "sans" | "serif" | "mono";
  weight: "regular" | "bold" | "black";
  color: string;
  shadow: "none" | "soft" | "hard";
  animation: "none" | "fade" | "rise" | "pop";
};

type TimelineDocument = {
  version: 1;
  aspect: "9:16" | "1:1" | "16:9";
  durationMs: number;
  video: VideoClip[];
  transitions: TimelineTransition[];
  text: TimelineTextLayer[];
  graphics: TimelineTextLayer[];
};
```

`normalizeTimeline()` must return a fresh plain object. IDs must match `/^[A-Za-z0-9_-]{1,64}$/`. The document must contain 1 to 100 video clips, start at zero, remain contiguous, and end exactly at `durationMs`. Source and layer ranges must be integer milliseconds. The total duration must be 100 to 300,000 milliseconds. Positions and opacity are 0 to 1, scale is 0.1 to 4, colours match six-digit uppercase or lowercase hex, transition duration is zero for `cut` and 100 to 2,000 milliseconds for other types, and every transition joins one adjacent clip pair. Text is trimmed and limited to 500 characters.

- [x] **Step 4: Run the targeted test**

Run: `npm test -- tests/projects.test.ts`

Expected: the pure normalization cases pass while persistence tests remain pending or skipped.

### Task 2: Persist owner-scoped projects and immutable revisions

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/projects.ts`
- Test: `tests/projects.test.ts`

- [x] **Step 1: Add failing Convex tests**

Cover these behaviors:

- an authenticated owner creates one project from a completed source job using a 100 to 300,000 millisecond browser-read duration;
- an exact repeated create returns the same project and revision;
- a different owner receives no source project and cannot save to it;
- queued, failed, missing-output, or foreign jobs cannot become projects;
- a saved revision requires the current active parent and creates the next revision number;
- a stale parent returns `PROJECT_REVISION_CONFLICT` without writing;
- the same `requestId` and same normalized timeline returns the existing revision;
- the same `requestId` with changed content returns `REQUEST_CONTENT_CONFLICT`;
- source job and upload IDs inside every clip belong to the project owner and are ready/completed;
- read projections exclude storage keys, lease fields, and unrelated job data.

- [x] **Step 2: Run the test and confirm schema/function failures**

Run: `npm test -- tests/projects.test.ts`

Expected: FAIL because the tables and project functions do not exist.

- [x] **Step 3: Add schema tables**

Add:

```ts
projects: defineTable({
  userId: v.string(),
  sourceJobId: v.id("genJobs"),
  name: v.string(),
  activeRevisionId: v.optional(v.id("projectRevisions")),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_source", ["userId", "sourceJobId"])
  .index("by_user_updated", ["userId", "updatedAt"]),

projectRevisions: defineTable({
  userId: v.string(),
  projectId: v.id("projects"),
  parentRevisionId: v.optional(v.id("projectRevisions")),
  revision: v.number(),
  requestId: v.string(),
  timeline: timelineDocumentValidator,
  createdAt: v.number(),
})
  .index("by_project_revision", ["projectId", "revision"])
  .index("by_project_request", ["projectId", "requestId"]),
```

- [x] **Step 4: Implement project mutations and query**

Create:

- `forSource({ sourceJobId, accountKey })`, which returns only `{ projectId, name, activeRevisionId, revision, timeline, updatedAt }` for the authenticated matching account;
- `createFromJob({ sourceJobId, durationMs, requestId })`, which validates the completed owned job and constructs one clip covering the full duration;
- `saveRevision({ projectId, parentRevisionId, requestId, timeline })`, which normalizes, validates every referenced source, fences the active parent, and writes the next immutable revision.

The initial clip ID is `source-${sourceJobId}` and the project name is the trimmed job prompt capped at 80 characters, falling back to `Untitled project`. The create mutation queries `by_user_source` before inserting and returns the existing project for exact retries. The mutation inserts the project, inserts revision 1, then patches `activeRevisionId` in one atomic transaction.

- [x] **Step 5: Run project tests and Convex typecheck**

Run: `npm test -- tests/projects.test.ts && npm run typecheck:convex`

Expected: all project tests pass and TypeScript exits 0.

### Task 3: Expose project state in the professional Studio

**Files:**
- Modify: `src/lib/convexApi.ts`
- Create: `src/components/ProjectTimelinePanel.tsx`
- Modify: `src/pages/Studio.tsx`
- Test: `tests/project-timeline-panel.test.tsx`

- [x] **Step 1: Write failing component tests**

Cover:

- the query is skipped without authentication, account key, or source job ID;
- a completed source with loaded finite duration shows `Create editable project` when no project exists;
- clicking create sends `{ sourceJobId, durationMs: Math.round(duration * 1000), requestId }` once and displays the returned revision;
- selecting or creating a project spends no generation and does not call an edit mutation;
- invalid or unloaded duration disables creation;
- account or source changes clear a late creation response;
- an existing project displays its name, revision, duration, clip count, and `Saved draft · no generation used`;
- a backend failure shows a retryable local message without hiding the video or other Studio controls.

- [x] **Step 2: Run the component test and confirm the missing component failure**

Run: `npm test -- tests/project-timeline-panel.test.tsx`

Expected: FAIL because `ProjectTimelinePanel` does not exist.

- [x] **Step 3: Add function references and component**

Add:

```ts
projects: {
  forSource: makeFunctionReference<"query">("projects:forSource"),
  createFromJob: makeFunctionReference<"mutation">("projects:createFromJob"),
  saveRevision: makeFunctionReference<"mutation">("projects:saveRevision"),
},
```

The component accepts `sourceJobId`, `accountKey`, `duration`, and `disabled`. It uses a stable pending payload and request ID until success, fences asynchronous completion with an epoch ref, and reports only safe error copy. It does not auto-create database rows merely because a user opened an old video.

- [x] **Step 4: Mount the panel in Studio**

Render `ProjectTimelinePanel` at the top of the existing `versions` slot. Pass the active completed job ID, Clerk account key, loaded media duration, and the current render/busy state. Keep the existing original/version navigation directly below it.

- [x] **Step 5: Run component and navigation tests**

Run: `npm test -- tests/project-timeline-panel.test.tsx tests/studio-navigation.test.tsx tests/studio-workspace.test.tsx`

Expected: all targeted UI tests pass.

### Task 4: Verify and record the foundation

**Files:**
- Modify: `docs/readiness/RELEASE-ACCEPTANCE.md`
- Modify: `AGENTS.md`

- [x] **Step 1: Run the full checks**

Run:

```bash
npm test
npm run typecheck:convex
npm run build
npm run lint
cd backend && npm test && npm run build && npm run typecheck
```

Expected: all tests and builds pass. Lint may retain only already documented warnings and must add no errors.

- [x] **Step 2: Run a local authenticated-browser harness**

Use substituted Clerk/Convex boundaries with the real Studio components and a real fixture video. Verify that duration loads, project creation happens only after the button click, the revision appears, and no generation mutation is called. Record measured UI response time separately from network substitution.

- [x] **Step 3: Document evidence and limits**

Record exact test counts and commands. State that this slice persists a draft timeline but does not yet render multiple clips, generate scenes, run Jev, or prove hosted latency.

- [x] **Step 4: Commit the implementation**

Use one commit for the timeline contract and persistence, one for the Studio integration, and one for verification documentation if the evidence changes after code review.
