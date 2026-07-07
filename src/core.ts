import { DedupeCache } from "./dedupe";
import type * as Hook from "./hook";
import * as RequestCreator from "./request";
import * as Sse from "./sse";
import type * as SseHook from "./sse-hook";
import { Language } from "./translations";
import * as Types from "./types";

/**
 * React integration injected by the `tapi-rs/react` entry point.
 *
 * The core builder never imports React. When constructed with an adapter
 * (via `import Tapi from "tapi-rs/react"`), built routes gain `.useHook` /
 * `.useSse`; without one (via `import Tapi from "tapi-rs"`), they don't —
 * and the types reflect that through the `TReact` flag.
 */
export type ReactAdapter = {
  useHook: (requester: Types.RequesterFunction<any, any>, params: any) => any;
  useSseHook: (
    host: string,
    config: Types.SseConfig<any, any, any, any>,
    params: any,
    options: { headers?: Record<string, string>; credentials?: RequestCredentials }
  ) => any;
};

type PathBuilderSignature<T extends Types.RequestConfig<any, any, any, any, any, any, any>> =
  Types.ExtractPath<T> extends undefined ? () => string : (params: Types.ExtractPath<T>) => string;

type ReactRouteMembers<T extends Types.RequestConfig<any, any, any, any, any, any, any>, TError, TReact extends boolean> = TReact extends true
  ? { useHook: (params: (Types.CallSignature<T> & { lazy?: boolean }) | null) => Hook.HookResponse<T, TError> }
  : {};

type ReactSseMembers<T extends Types.SseConfig<any, any, any, any>, TReact extends boolean> = TReact extends true
  ? { useSse: (params: SseHook.SseHookParams<T> | null) => SseHook.SseHookResponse }
  : {};

type RouteFunction<T extends Types.RequestConfig<any, any, any, any, any, any, any>, TError = string, TReact extends boolean = false> = Types.RequesterFunction<
  T,
  TError
> & {
  path: PathBuilderSignature<T>;
} & ReactRouteMembers<T, TError, TReact>;

type SseRouteFunction<T extends Types.SseConfig<any, any, any, any>, TReact extends boolean = false> = Types.SseListenerFunction<T> & ReactSseMembers<T, TReact>;

export type GenerateApiMethods<T extends Types.RouteDefinitions, TError = string, TReact extends boolean = false> = {
  [K in keyof T]: T[K] extends Types.SseConfig<any, any, any, any>
    ? SseRouteFunction<T[K], TReact>
    : T[K] extends Types.RequestConfig<any, any, any, any, any, any, any>
      ? RouteFunction<T[K], TError, TReact>
      : T[K] extends Types.RouteDefinitions
        ? GenerateApiMethods<T[K], TError, TReact>
        : never;
} & {
  /**
   * Update default headers for all requests in this API instance
   */
  setHeaders: (headers: Record<string, string>) => void;
};

/**
 * Check if a value is a RequestConfig by duck-typing
 */
function isRequestConfig(value: unknown): value is Types.RequestConfig<any, any, any, any, any, any, any> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as any;
  return typeof v.method === "string" && typeof v.endpoint === "string" && typeof v.response === "object" && v.response !== null;
}

function isSseConfig(value: unknown): value is Types.SseConfig<any, any, any, any> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as any;
  return v.type === "sse" && typeof v.endpoint === "string";
}

/**
 * Recursively creates nested API methods based on route definitions
 */
function createNestedMethods<TError = string>(
  host: string,
  routes: Types.RouteDefinitions,
  target: any,
  prefetchCallback: Types.PrefetchCallback | undefined,
  postfetchCallback: Types.PostfetchCallback<any, TError> | undefined,
  defaultHeaders: Record<string, string> | undefined,
  errorHandler: ((response: Response) => Promise<TError>) | undefined,
  language: Language = "en",
  credentials?: RequestCredentials,
  reactAdapter?: ReactAdapter,
  dedupe?: DedupeCache
) {
  // Store headers and update function references for use by setHeaders method
  let currentHeaders = defaultHeaders;
  const updateTargets: Array<any> = [];

  for (const [routeName, routeValue] of Object.entries(routes)) {
    if (isSseConfig(routeValue)) {
      // SSE streams over `fetch`, so it honors both default headers (kept in
      // sync via setHeaders by reading `currentHeaders` lazily) and per-call
      // headers, plus `credentials` for cookie-based auth — just like requests.
      const sseConfig = routeValue;
      const sseFunction = (params: any, handlers: Sse.SseHandlers<any>) => {
        const url = Sse.buildSseUrl(host, sseConfig.endpoint, params);
        const headers = { ...(currentHeaders || {}), ...(params.headers || {}) };
        return Sse.createConnection(url, handlers, { headers, credentials });
      };
      if (reactAdapter) {
        (sseFunction as any).useSse = (params: any) => reactAdapter.useSseHook(host, sseConfig, params, { headers: currentHeaders, credentials });
      }
      target[routeName] = sseFunction;
    } else if (isRequestConfig(routeValue)) {
      const requester = RequestCreator.create(host, routeValue, prefetchCallback, postfetchCallback, currentHeaders, errorHandler, language, credentials, dedupe);
      if (reactAdapter) {
        (requester as any).useHook = (params: any) => reactAdapter.useHook(requester, params);
      }
      (requester as any).path = (params?: Record<string, string>) => {
        let url = routeValue.endpoint;
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            url = url.replace(`:${key}`, encodeURIComponent(String(value)));
          }
        }
        return `${host}${url}`;
      };
      target[routeName] = requester;
      updateTargets.push({ target: routeName, config: routeValue });
    } else if (typeof routeValue === "object" && routeValue !== null) {
      target[routeName] = {};
      createNestedMethods(
        host,
        routeValue as Types.RouteDefinitions,
        target[routeName],
        prefetchCallback,
        postfetchCallback,
        currentHeaders,
        errorHandler,
        language,
        credentials,
        reactAdapter,
        dedupe
      );
    }
  }

  // Add setHeaders method to update headers for all nested routes
  target.setHeaders = (headers: Record<string, string>) => {
    currentHeaders = headers;

    // Update existing routes with new headers
    for (const item of updateTargets) {
      const requester = RequestCreator.create(host, item.config, prefetchCallback, postfetchCallback, headers, errorHandler, language, credentials, dedupe);
      if (reactAdapter) {
        (requester as any).useHook = (params: any) => reactAdapter.useHook(requester, params);
      }
      (requester as any).path = (params?: Record<string, string>) => {
        let url = item.config.endpoint;
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            url = url.replace(`:${key}`, encodeURIComponent(String(value)));
          }
        }
        return `${host}${url}`;
      };
      target[item.target] = requester;
    }

    // Update headers for nested objects
    for (const key in target) {
      if (target.hasOwnProperty(key) && typeof target[key] === "object" && target[key] !== null && typeof target[key].setHeaders === "function" && key !== "setHeaders") {
        target[key].setHeaders(headers);
      }
    }
  };
}

/**
 * Builder class for creating API methods with proper type inference and compile-time validation
 */
export class TapiBuilder<
  TRoutes extends Types.RouteDefinitions = {},
  TError = string,
  THasHost extends boolean = false,
  THasRoutes extends boolean = false,
  TReact extends boolean = false
> {
  private host?: string;
  private routes?: TRoutes;
  private prefetchCallback?: Types.PrefetchCallback;
  private postfetchCallback?: Types.PostfetchCallback<any, TError>;
  private defaultHeaders?: Record<string, string>;
  private errorHandler?: (response: Response) => Promise<TError>;
  private language: Language = "en";
  private credentials?: RequestCredentials;
  private getDedupeTtlMs?: number;
  private reactAdapter?: ReactAdapter;

  /**
   * @param reactAdapter Injected by the `tapi-rs/react` entry point to enable
   * `.useHook` / `.useSse` on built routes. The core entry leaves it undefined.
   */
  constructor(reactAdapter?: ReactAdapter) {
    this.reactAdapter = reactAdapter;
  }

  /**
   * Create a fresh builder of the (possibly re-typed) shape, carrying over the
   * current configuration and React adapter. Caller applies its specific change.
   */
  private clone<NRoutes extends Types.RouteDefinitions, NError, NHasHost extends boolean, NHasRoutes extends boolean>(): TapiBuilder<
    NRoutes,
    NError,
    NHasHost,
    NHasRoutes,
    TReact
  > {
    const builder = new TapiBuilder<NRoutes, NError, NHasHost, NHasRoutes, TReact>(this.reactAdapter);
    builder.host = this.host;
    builder.routes = this.routes as unknown as NRoutes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback as unknown as Types.PostfetchCallback<any, NError>;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler as unknown as (response: Response) => Promise<NError>;
    builder.language = this.language;
    builder.credentials = this.credentials;
    builder.getDedupeTtlMs = this.getDedupeTtlMs;
    return builder;
  }

  /**
   * Set the host URL for API requests
   */
  withHost(host: string): TapiBuilder<TRoutes, TError, true, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, true, THasRoutes>();
    builder.host = host;
    return builder;
  }

  /**
   * Set the route definitions with proper type inference
   */
  withRoutes<T extends Types.RouteDefinitions>(routes: T): TapiBuilder<T, TError, THasHost, true, TReact> {
    const builder = this.clone<T, TError, THasHost, true>();
    builder.routes = routes;
    return builder;
  }

  /**
   * Set the error handler with proper type inference
   */
  withApiError<T>(errorHandler: (response: Response) => Promise<T>): TapiBuilder<TRoutes, T, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, T, THasHost, THasRoutes>();
    builder.postfetchCallback = undefined; // Reset postfetch as error type changed
    builder.errorHandler = errorHandler;
    return builder;
  }

  /**
   * Set the prefetch callback that runs before each request
   */
  withPrefetch(callback: Types.PrefetchCallback): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.prefetchCallback = callback;
    return builder;
  }

  /**
   * Set the postfetch callback that runs after each request
   */
  withPostfetch(callback: Types.PostfetchCallback<any, TError>): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.postfetchCallback = callback;
    return builder;
  }

  /**
   * Set default headers for all requests
   */
  withDefaultHeaders(headers: Record<string, string>): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.defaultHeaders = headers;
    return builder;
  }

  /**
   * Set the language for error messages
   */
  withLanguage(language: Language): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.language = language;
    return builder;
  }

  /**
   * Set the credentials mode for all requests (e.g. "include" for cross-origin cookies)
   */
  withCredentials(credentials: RequestCredentials): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.credentials = credentials;
    return builder;
  }

  /**
   * Deduplicate identical GET requests fired within `ttlMs` milliseconds
   * (default 1000) into a single network request — e.g. several components on
   * one screen each fetching the same resource. Every caller receives its own
   * clone of the shared response; request headers participate in the dedupe
   * key, so a credentials change is never served another identity's response.
   * Any non-GET clears the window once it settles, so a refetch awaited after
   * a mutation always hits the network. Off unless called.
   */
  withGetDedupe(ttlMs: number = 1000): TapiBuilder<TRoutes, TError, THasHost, THasRoutes, TReact> {
    const builder = this.clone<TRoutes, TError, THasHost, THasRoutes>();
    builder.getDedupeTtlMs = ttlMs;
    return builder;
  }

  /**
   * Build the API client with compile-time validation
   *
   * This method enforces that all required configurations are set:
   * - Host URL
   * - Route definitions
   */
  build(
    ...args: THasHost extends false ? ["Host is required - use .withHost() first"] : THasRoutes extends false ? ["Routes are required - use .withRoutes() first"] : []
  ): THasHost extends true ? (THasRoutes extends true ? GenerateApiMethods<TRoutes, TError, TReact> : never) : never {
    const apiMethods: any = {};
    createNestedMethods(
      this.host as string,
      this.routes as TRoutes,
      apiMethods,
      this.prefetchCallback,
      this.postfetchCallback,
      this.defaultHeaders,
      this.errorHandler,
      this.language,
      this.credentials,
      this.reactAdapter,
      this.getDedupeTtlMs === undefined ? undefined : new DedupeCache(this.getDedupeTtlMs)
    );
    return apiMethods as any;
  }
}
