import { brandSettings, brandSelection } from './brandValues';
import { feedbackSummaryValidator } from './feedbackValues';
import { youtubeMomentsTable } from './youtubeValues';
import { savedScenePlanValidator } from './scenePlanValues';
import { renderProgressValidator } from './renderProgress';
import { transformsValidator } from './transforms';
import { captionStyleValidator, captionPositionValidator, captionFontValidator, captionLanguageValidator } from './captions';
import { timelineDocumentValidator } from './timelineValues';
import { claimsCheckValidator } from './claims';
import { defineSchema, defineTable } from "convex/server";
import { musicSnapshot, musicSelection } from "./music";
import { v } from "convex/values";

export default defineSchema({
  // Release invariant: projects, projectRevisions, and projectSources deploy together.
  // Every public revision writer inserts its immutable source rows in the same transaction.
  projects: defineTable({
    userId: v.string(), sourceJobId: v.optional(v.id('genJobs')), name: v.string(),
    createRequestId: v.optional(v.string()), createFingerprint: v.optional(v.string()),
    activeRevisionId: v.optional(v.id('projectRevisions')), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_user_source', ['userId', 'sourceJobId'])
    .index('by_user_create_request', ['userId', 'createRequestId'])
    .index('by_user_updated', ['userId', 'updatedAt']),
  projectRevisions: defineTable({
    userId: v.string(), projectId: v.id('projects'), parentRevisionId: v.optional(v.id('projectRevisions')),
    revision: v.number(), requestId: v.string(), timeline: timelineDocumentValidator, createdAt: v.number(),
  }).index('by_project_revision', ['projectId', 'revision']).index('by_project_request', ['projectId', 'requestId']),
  projectSources: defineTable(v.union(
    v.object({
      userId: v.string(), projectId: v.id('projects'), revisionId: v.id('projectRevisions'),
      kind: v.literal('job'), jobId: v.id('genJobs'),
    }),
    v.object({
      userId: v.string(), projectId: v.id('projects'), revisionId: v.id('projectRevisions'),
      kind: v.literal('upload'), uploadId: v.id('uploads'),
    }),
  )).index('by_revision', ['revisionId']).index('by_upload', ['uploadId']).index('by_job', ['jobId']),
  reviewCreators: defineTable({ userId: v.string(), windowAt: v.number(), count: v.number() }).index('by_user', ['userId']),
  reviewLinks: defineTable({
    userId: v.string(), jobId: v.id('genJobs'), tokenHash: v.string(), storageKey: v.string(),
    createdAt: v.number(), expiresAt: v.number(), revokedAt: v.optional(v.number()), durationSec: v.number(),
    commentCount: v.number(), commentWindowAt: v.optional(v.number()), commentWindowCount: v.optional(v.number()),
    signWindowAt: v.optional(v.number()), signWindowCount: v.optional(v.number()),
  }).index('by_token', ['tokenHash']).index('by_user_created', ['userId', 'createdAt']).index('by_job_created', ['jobId', 'createdAt']),
  reviewComments: defineTable({
    reviewId: v.id('reviewLinks'), requestId: v.string(), name: v.string(), text: v.string(), at: v.number(),
    createdAt: v.number(), resolved: v.boolean(),
  }).index('by_review', ['reviewId']).index('by_request', ['reviewId', 'requestId']),
  feedbackSummaries: defineTable({ userId: v.string(), jobId: v.id('genJobs'), windowAt: v.number(), windowCount: v.number(), result: v.optional(feedbackSummaryValidator) }).index('by_job', ['jobId']),
  youtubeMoments: defineTable(youtubeMomentsTable).index('by_user_created', ['userId', 'createdAt']).index('by_created', ['createdAt']),
  youtubeShares: defineTable({ token: v.string(), userId: v.string(), analysisId: v.id('youtubeMoments'), moment: v.number(), createdAt: v.number() }).index('by_token', ['token']).index('by_analysis_moment', ['analysisId', 'moment']),
  brandKits: defineTable({ userId: v.string(), name: v.string(), revision: v.number(), settings: brandSettings }).index("by_user", ["userId"]),
  users: defineTable({
    tokenIdentifier: v.string(), // Firebase Auth user id (token subject)
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    credits: v.number(),
    freeUsed: v.number(),
    founding: v.optional(v.boolean()),
    defaultMode: v.optional(v.union(v.literal("edit"), v.literal("generate"), v.literal("clip"))),
    defaultAspect: v.optional(v.union(v.literal("9:16"), v.literal("1:1"), v.literal("16:9"))),
    defaultCaptionStyle: v.optional(v.union(v.literal("auto"), v.literal("clean"), v.literal("meme"), v.literal("karaoke"), v.literal("none"))),
    openFinishedInStudio: v.optional(v.boolean()),
    showShortcutHints: v.optional(v.boolean()),
  }).index("by_token", ["tokenIdentifier"]).index("by_email", ["email"]),

  generations: defineTable({
    tokenIdentifier: v.string(),
    mode: v.string(), // "free" | "credit"
    prompt: v.optional(v.string()),
    at: v.number(),
  }).index("by_token", ["tokenIdentifier"]),

  purchases: defineTable({
    tokenIdentifier: v.string(),
    packId: v.string(),
    credits: v.number(),
    amountUsd: v.number(),
    provider: v.string(),
    reference: v.optional(v.string()),
    at: v.number(),
  }).index("by_token", ["tokenIdentifier"]).index("by_reference", ["reference"]),

  checkoutOrders: defineTable({
    userId: v.string(), packId: v.string(), productId: v.string(), environment: v.string(),
    credits: v.number(), amountMinor: v.number(), status: v.string(), createdAt: v.number(),
    requestId: v.optional(v.string()), checkoutCreating: v.optional(v.boolean()), checkoutUrl: v.optional(v.string()),
    paidTotalMinor: v.optional(v.number()), taxMinor: v.optional(v.number()),
    statusObservedAt: v.optional(v.number()),
    lastRefreshAt: v.optional(v.number()),
    nextReconcileAt: v.optional(v.number()), reconcileAttempt: v.optional(v.number()), reconcileRunning: v.optional(v.boolean()), reconcileError: v.optional(v.string()), reconciledAt: v.optional(v.number()),
    reconcileFinishedAttempt: v.optional(v.number()),
    refundedAmountMinor: v.optional(v.number()), refundedCredits: v.optional(v.number()),
    disputeReview: v.optional(v.boolean()),
    sessionId: v.optional(v.string()), paymentId: v.optional(v.string()),
    recoveredSessionPaymentId: v.optional(v.string()), sessionRecoveredAt: v.optional(v.number()),
  }).index('by_environment_session', ['environment', 'sessionId']).index('by_user', ['userId']).index('by_request', ['userId', 'requestId']).index('by_environment_reconcile', ['environment', 'nextReconcileAt']).index('by_environment_dispute_created', ['environment', 'disputeReview', 'createdAt']).index('by_environment_error_created', ['environment', 'reconcileError', 'createdAt']),
  paymentDisputes: defineTable({ orderId: v.id('checkoutOrders'), reference: v.string(), paymentId: v.string(), environment: v.string(), amount: v.string(), currency: v.string(), status: v.string(), stage: v.string(), providerCreatedAt: v.number(), observedAt: v.number() }).index('by_reference', ['reference']).index('by_order', ['orderId']),
  paymentRefunds: defineTable({ orderId: v.id('checkoutOrders'), reference: v.string(), paymentId: v.string(), amountMinor: v.number(), at: v.number() }).index('by_reference', ['reference']),

  waitlist: defineTable({
    email: v.string(),
    source: v.optional(v.string()),
    position: v.number(),
    at: v.number(),
  }).index("by_email", ["email"]),

  telegramLinks: defineTable({
    captionStyle: v.optional(captionStyleValidator),
    userId: v.string(), code: v.optional(v.string()), expiresAt: v.optional(v.number()), telegramUserId: v.optional(v.string()),
    pendingPrompt: v.optional(v.string()), pendingUntil: v.optional(v.number()),
    music: v.optional(musicSelection),
  }).index('by_user', ['userId']).index('by_code', ['code']).index('by_telegram', ['telegramUserId']),
  telegramUpdates: defineTable({ updateId: v.number(), at: v.number() }).index('by_update', ['updateId']).index('by_time', ['at']),
  telegramMessages: defineTable({
    chatId: v.string(), text: v.optional(v.string()), status: v.string(), attempts: v.number(),
    createdAt: v.number(), expiresAt: v.number(), nextAt: v.number(),
    deliveredAt: v.optional(v.number()), messageId: v.optional(v.number()), error: v.optional(v.string()),
  }).index('by_status_next', ['status', 'nextAt']),
  storageSweeps: defineTable({
    name: v.string(), mode: v.string(), cursor: v.union(v.string(), v.null()), cutoff: v.number(),
    scanned: v.number(), candidates: v.number(), deleted: v.number(), protected: v.number(),
    totalScanned: v.number(), totalDeleted: v.number(), lastRunAt: v.number(),
    lastCompletedAt: v.optional(v.number()),
  }).index('by_name', ['name']),
  uploads: defineTable({
    kind: v.optional(v.union(v.literal('video'), v.literal('audio'))), confirmedOwnership: v.optional(v.boolean()),
    userId: v.string(), name: v.string(), size: v.number(), contentType: v.string(),
    status: v.string(), createdAt: v.number(), storageId: v.optional(v.id('_storage')),
    mediaDurationMs: v.optional(v.number()), mediaWidth: v.optional(v.number()),
    mediaHeight: v.optional(v.number()), mediaHasAudio: v.optional(v.boolean()),
    probeToken: v.optional(v.string()), probeStorageId: v.optional(v.id('_storage')),
    probeExpiresAt: v.optional(v.number()), probeAttempts: v.optional(v.number()),
    probeError: v.optional(v.string()), probeDispatchAttempts: v.optional(v.number()),
    probeDispatchGeneration: v.optional(v.number()),
  }).index('by_user', ['userId']).index('by_user_status', ['userId', 'status']).index('by_storage', ['storageId']).index('by_status_created', ['status', 'createdAt']),
  genJobs: defineTable({
    userId: v.string(),
    mode: v.string(),
    captionStyle: v.optional(captionStyleValidator),
    captionLanguage: v.optional(captionLanguageValidator),
    captionTexts: v.optional(v.array(v.string())),
    captionPosition: v.optional(captionPositionValidator),
    captionFont: v.optional(captionFontValidator),
    transforms: v.optional(transformsValidator),
    speakerReframe: v.optional(v.boolean()),
    brandKit: v.optional(brandSelection), brand: v.optional(brandSettings),
    hookTitle: v.optional(v.string()),
    captionTransform: v.optional(v.boolean()),
    generationKind: v.optional(v.union(v.literal('stock'), v.literal('ai'))),
    projectId: v.optional(v.id('projects')),
    projectRevisionId: v.optional(v.id('projectRevisions')),
    timelineExport: v.optional(v.object({
      profile: v.object({ container: v.literal('mp4'), fps: v.literal(30) }),
      timeline: timelineDocumentValidator,
    })),
    sceneArchive: v.optional(v.object({ cleanStorageKey: v.string(), captionStorageKey: v.string() })),
    sceneReplacement: v.optional(v.object({ index: v.number(), uploadId: v.id('uploads'), plan: savedScenePlanValidator })),
    scenePlan: v.optional(savedScenePlanValidator),
    scenePlanLeaseToken: v.optional(v.string()), scenePlanAttempt: v.optional(v.number()),
    aiStarted: v.optional(v.boolean()), aiOperation: v.optional(v.string()),
    music: v.optional(musicSnapshot), retainedMusic: v.optional(musicSnapshot),
    prompt: v.string(),
    status: v.string(), // queued | processing | done | failed
    aspect: v.optional(v.string()),
    requestId: v.optional(v.string()),
    reservation: v.optional(v.union(v.literal('free'), v.literal('credit'))),
    refunded: v.optional(v.boolean()),
    attempts: v.optional(v.number()),
    renderProgress: v.optional(renderProgressValidator),
    renderProgressHistory: v.optional(v.array(renderProgressValidator)),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    storageKey: v.optional(v.string()),
    mediaDurationMs: v.optional(v.number()), mediaWidth: v.optional(v.number()),
    mediaHeight: v.optional(v.number()), mediaHasAudio: v.optional(v.boolean()),
    sourceStorageId: v.optional(v.id('_storage')), musicStorageId: v.optional(v.id('_storage')),
    sourceStorageKey: v.optional(v.string()),
    parentJobId: v.optional(v.id('genJobs')),
    rootJobId: v.optional(v.id('genJobs')),
    sourceCaptionStorageKey: v.optional(v.string()),
    cleanStorageKey: v.optional(v.string()), captionStorageKey: v.optional(v.string()),
    claims: v.optional(claimsCheckValidator), coverStorageKey: v.optional(v.string()),
    telegramMessageId: v.optional(v.number()),
    telegramDeliveryStatus: v.optional(v.string()),
    telegramDeliveryAttempt: v.optional(v.number()),
    telegramDeliveryLimit: v.optional(v.number()), telegramDeliveryRetriedAt: v.optional(v.number()),
    telegramDeliveryExpiresAt: v.optional(v.number()),
    telegramDeliveryStartedAt: v.optional(v.number()),
    telegramDeliveredAt: v.optional(v.number()),
    telegramChatId: v.optional(v.string()),
    telegramFileId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()), // set for edit jobs: the reel being edited
    resultUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    legacyRecovery: v.optional(v.object({ at: v.number(), failedAt: v.number(), error: v.string() })),
  })
    .index("by_source_storage", ["sourceStorageId"])
    .index("by_root_user", ["rootJobId", "userId"])
    .index("by_music_status", ["musicStorageId", "status"])
    .index("by_source_status", ["sourceStorageId", "status"])
    .index("by_delivery", ["telegramDeliveryStatus"])
    .index("by_telegram_message", ["telegramChatId", "telegramMessageId"])
    .index("by_request", ["userId", "requestId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_status_lease", ["status", "leaseExpiresAt"])
    .index("by_status_reservation", ["status", "reservation"])
    .index("by_reservation_created", ["reservation", "createdAt"])
    .index("by_kind_created", ["generationKind", "createdAt"])
    .index("by_user", ["userId"]),
});
