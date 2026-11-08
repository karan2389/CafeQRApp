/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_helpers from "../auth_helpers.js";
import type * as billing from "../billing.js";
import type * as categories from "../categories.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as kitchen from "../kitchen.js";
import type * as menu from "../menu.js";
import type * as orders from "../orders.js";
import type * as seed from "../seed.js";
import type * as service_requests from "../service_requests.js";
import type * as sessions from "../sessions.js";
import type * as tables from "../tables.js";
import type * as test_helpers from "../test_helpers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  auth_helpers: typeof auth_helpers;
  billing: typeof billing;
  categories: typeof categories;
  health: typeof health;
  http: typeof http;
  kitchen: typeof kitchen;
  menu: typeof menu;
  orders: typeof orders;
  seed: typeof seed;
  service_requests: typeof service_requests;
  sessions: typeof sessions;
  tables: typeof tables;
  test_helpers: typeof test_helpers;
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
