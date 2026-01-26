export type { CustomError, Errors, HttpMethod, MapperError, NetworkError, ApiResponse, Success, UndefinedParamError } from "./types";

export type { RefreshFunction } from "./hook";
export type { Language } from "./translations";
export type { ResponseConfig } from "./response";

import { TapiBuilder } from "./core";
import { Endpoints } from "./endpoints";
import { create as response } from "./response";

/**
 * Tapi - Type-safe API client builder
 *
 * A modern REST API client builder using pure TypeScript types.
 * No runtime validation - compile-time type safety only.
 */
const Tapi = {
  builder: () => new TapiBuilder(),
  response,
  get: Endpoints.get,
  post: Endpoints.post,
  put: Endpoints.put,
  delete: Endpoints.delete,
  patch: Endpoints.patch
} as const;

export default Tapi;
