/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _guards from "../_guards.js";
import type * as accounts from "../accounts.js";
import type * as billing from "../billing.js";
import type * as crons from "../crons.js";
import type * as posts from "../posts.js";
import type * as rewrites from "../rewrites.js";
import type * as subscriptions from "../subscriptions.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _guards: typeof _guards;
  accounts: typeof accounts;
  billing: typeof billing;
  crons: typeof crons;
  posts: typeof posts;
  rewrites: typeof rewrites;
  subscriptions: typeof subscriptions;
  uploads: typeof uploads;
  users: typeof users;
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
