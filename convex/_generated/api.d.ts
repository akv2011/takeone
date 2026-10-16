/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as captions from "../captions.js";
import type * as config from "../config.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as disputeSnapshot from "../disputeSnapshot.js";
import type * as dodoWebhook from "../dodoWebhook.js";
import type * as email from "../email.js";
import type * as generate from "../generate.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as music from "../music.js";
import type * as operations from "../operations.js";
import type * as paymentReview from "../paymentReview.js";
import type * as paymentStates from "../paymentStates.js";
import type * as payments from "../payments.js";
import type * as requestBody from "../requestBody.js";
import type * as storageCleanup from "../storageCleanup.js";
import type * as telegram from "../telegram.js";
import type * as telegramDelivery from "../telegramDelivery.js";
import type * as telegramMessages from "../telegramMessages.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  captions: typeof captions;
  config: typeof config;
  credits: typeof credits;
  crons: typeof crons;
  disputeSnapshot: typeof disputeSnapshot;
  dodoWebhook: typeof dodoWebhook;
  email: typeof email;
  generate: typeof generate;
  http: typeof http;
  jobs: typeof jobs;
  music: typeof music;
  operations: typeof operations;
  paymentReview: typeof paymentReview;
  paymentStates: typeof paymentStates;
  payments: typeof payments;
  requestBody: typeof requestBody;
  storageCleanup: typeof storageCleanup;
  telegram: typeof telegram;
  telegramDelivery: typeof telegramDelivery;
  telegramMessages: typeof telegramMessages;
  uploads: typeof uploads;
  users: typeof users;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
