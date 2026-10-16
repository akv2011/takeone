// String-based function references so the frontend builds without `convex dev` codegen.
import { makeFunctionReference } from "convex/server";

export const api = {
  projects: {
    forSource: makeFunctionReference<"query">("projects:forSource"),
    get: makeFunctionReference<"query">("projects:get"),
    listSources: makeFunctionReference<"query">("projects:listSources"),
    sourcesForRevision: makeFunctionReference<"query">("projects:sourcesForRevision"),
    createFromJob: makeFunctionReference<"mutation">("projects:createFromJob"),
    createAssembly: makeFunctionReference<"mutation">("projects:createAssembly"),
    saveRevision: makeFunctionReference<"mutation">("projects:saveRevision"),
    requestExport: makeFunctionReference<"mutation">("projects:requestExport"),
  },
  speakerReframe: { request: makeFunctionReference<"mutation">("speakerReframe:request") },
  reviews: {
    create: makeFunctionReference<'action'>('reviews:create'),
    list: makeFunctionReference<'query'>('reviews:list'),
    feedback: makeFunctionReference<'query'>('reviews:feedback'),
    revoke: makeFunctionReference<'mutation'>('reviews:revoke'),
    remove: makeFunctionReference<'mutation'>('reviews:remove'),
    resolve: makeFunctionReference<'mutation'>('reviews:resolve'),
    get: makeFunctionReference<'query'>('reviews:get'),
    addComment: makeFunctionReference<'mutation'>('reviews:addComment'),
    playback: makeFunctionReference<'action'>('reviews:playback'),
  },
  sceneReplacements: { options: makeFunctionReference<"query">("sceneReplacements:options"), request: makeFunctionReference<"mutation">("sceneReplacements:request") },
  brandKits: { list: makeFunctionReference<"query">("brandKits:list"), save: makeFunctionReference<"mutation">("brandKits:save") },
  hookVariants: { request: makeFunctionReference<"mutation">("hookVariants:request") },
  scenePlans: { get: makeFunctionReference<"query">("scenePlans:get") },
  uploads: {
    list: makeFunctionReference<"query">("uploads:list"),
    probeStatuses: makeFunctionReference<"query">("uploads:probeStatuses"),
    remove: makeFunctionReference<"mutation">("uploads:remove"),
    begin: makeFunctionReference<"mutation">("uploads:begin"),
    finish: makeFunctionReference<"mutation">("uploads:finish"),
    requestEdit: makeFunctionReference<"mutation">("uploads:requestEdit"),
  },
  music: { listTracks: makeFunctionReference<"query">("music:listTracks"), preview: makeFunctionReference<"action">("music:preview") },
  users: {
    currentUser: makeFunctionReference<"query">("users:currentUser"),
    ensureUser: makeFunctionReference<"mutation">("users:ensureUser"),
    updatePreferences: makeFunctionReference<"mutation">("users:updatePreferences"),
  },
  credits: {
    getPacks: makeFunctionReference<"query">("credits:getPacks"),
    consumeGeneration: makeFunctionReference<"mutation">("credits:consumeGeneration"),
  },
  waitlist: {
    join: makeFunctionReference<"mutation">("waitlist:join"),
    count: makeFunctionReference<"query">("waitlist:count"),
  },
  payments: {
    resumeCheckout: makeFunctionReference<"action">("payments:resumeCheckout"),
    listHistory: makeFunctionReference<"query">("payments:listHistory"),
    history: makeFunctionReference<"query">("payments:history"),
    refreshStatus: makeFunctionReference<"action">("payments:refreshStatus"),
    createCheckout: makeFunctionReference<"action">("payments:createCheckout"),
    orderStatus: makeFunctionReference<"query">("payments:orderStatus"),
  },
  telegramDelivery: { retry: makeFunctionReference<"mutation">("telegramDelivery:retry") },
  telegram: {
    status: makeFunctionReference<"query">("telegram:status"),
    createLink: makeFunctionReference<"mutation">("telegram:createLink"),
    unlink: makeFunctionReference<"mutation">("telegram:unlink"),
  },
  generate: {
    requestBrandEdit: makeFunctionReference<"mutation">("generate:requestBrandEdit"),
    listJobs: makeFunctionReference<"query">("generate:listJobs"),
    getCaptionCues: makeFunctionReference<"action">("generate:getCaptionCues"),
    capabilities: makeFunctionReference<"query">("generate:capabilities"),
    getDownload: makeFunctionReference<"action">("generate:getDownload"),
    cancelJob: makeFunctionReference<"mutation">("generate:cancelJob"),
    requestGeneration: makeFunctionReference<"mutation">("generate:requestGeneration"),
    myJobs: makeFunctionReference<"query">("generate:myJobs"),
    getJob: makeFunctionReference<"query">("generate:getJob"),
    listVersions: makeFunctionReference<"query">("generate:listVersions"),
    versions: makeFunctionReference<"query">("generate:versions"),
    requestEdit: makeFunctionReference<"mutation">("generate:requestEdit"),
    requestCaptionEdit: makeFunctionReference<"mutation">("generate:requestCaptionEdit"),
  },
};

// Firebase Authentication signs people in and Convex verifies its ID tokens. src/lib/firebase.ts reads the same config.
export const authEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  && import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_APP_ID);
export const convexEnabled = Boolean(import.meta.env.VITE_CONVEX_URL);
