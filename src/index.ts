export type { CustomError, Errors, HttpMethod, NetworkError, ApiResponse, Success } from "./types";
export type { SseConfig, SseCallSignature, SseListenerFunction } from "./types";
export type { SseHookResponse } from "./sse-hook";

export type { RefreshFunction } from "./hook";
export type { Language } from "./translations";

import { TapiBuilder } from "./core";
import { Endpoints } from "./endpoints";

/**
 * Tapi - Type-safe API client builder
 *
 * A modern REST API client builder using pure TypeScript types.
 * No runtime validation - compile-time type safety only.
 */
const Tapi = {
  builder: () => new TapiBuilder(),
  get: Endpoints.get,
  post: Endpoints.post,
  put: Endpoints.put,
  delete: Endpoints.delete,
  patch: Endpoints.patch,
  sse: Endpoints.sse
} as const;

export default Tapi;
