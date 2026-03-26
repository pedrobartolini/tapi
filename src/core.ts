import * as Hook from "./hook";
import * as RequestCreator from "./request";
import * as Sse from "./sse";
import * as SseHook from "./sse-hook";
import { Language } from "./translations";
import * as Types from "./types";

type PathBuilderSignature<T extends Types.RequestConfig<any, any, any, any, any, any, any>> =
  Types.ExtractPath<T> extends undefined
    ? () => string
    : (params: Types.ExtractPath<T>) => string;

type RouteFunction<T extends Types.RequestConfig<any, any, any, any, any, any, any>, TError = string> = Types.RequesterFunction<T, TError> & {
  useHook: (params: (Types.CallSignature<T> & { lazy?: boolean }) | null) => Hook.HookResponse<T, TError>;
  path: PathBuilderSignature<T>;
};

type SseRouteFunction<T extends Types.SseConfig<any, any, any>> = Types.SseListenerFunction<T> & {
  useHook: (params: Types.SseCallSignature<T> | null) => SseHook.SseHookResponse<T>;
};

export type GenerateApiMethods<T extends Types.RouteDefinitions, TError = string> = {
  [K in keyof T]: T[K] extends Types.SseConfig<any, any, any>
    ? SseRouteFunction<T[K]>
    : T[K] extends Types.RequestConfig<any, any, any, any, any, any, any>
      ? RouteFunction<T[K], TError>
      : T[K] extends Types.RouteDefinitions
        ? GenerateApiMethods<T[K], TError>
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

function isSseConfig(value: unknown): value is Types.SseConfig<any, any, any> {
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
  credentials?: RequestCredentials
) {
  // Store headers and update function references for use by setHeaders method
  let currentHeaders = defaultHeaders;
  const updateTargets: Array<any> = [];

  for (const [routeName, routeValue] of Object.entries(routes)) {
    if (isSseConfig(routeValue)) {
      // SSE uses EventSource which does not support custom headers,
      // so SSE routes are intentionally excluded from setHeaders updates.
      // However, EventSource supports withCredentials for cookie-based auth.
      const sseConfig = routeValue;
      const withCredentials = credentials === "include";
      const sseFunction = (params: any, callback: (data: any) => void) => {
        const url = Sse.buildSseUrl(host, sseConfig.endpoint, params);
        return Sse.createConnection(url, callback, undefined, withCredentials);
      };
      (sseFunction as any).useHook = (params: any) =>
        SseHook.useSseHook(host, sseConfig, params, withCredentials);
      target[routeName] = sseFunction;
    } else if (isRequestConfig(routeValue)) {
      const requester = RequestCreator.create(host, routeValue, prefetchCallback, postfetchCallback, currentHeaders, errorHandler, language, credentials);
      const hook = (params: any) => Hook.useHook<any, TError>(requester, params);
      (requester as any).useHook = hook;
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
      createNestedMethods(host, routeValue as Types.RouteDefinitions, target[routeName], prefetchCallback, postfetchCallback, currentHeaders, errorHandler, language, credentials);
    }
  }

  // Add setHeaders method to update headers for all nested routes
  target.setHeaders = (headers: Record<string, string>) => {
    currentHeaders = headers;

    // Update existing routes with new headers
    for (const item of updateTargets) {
      const requester = RequestCreator.create(host, item.config, prefetchCallback, postfetchCallback, headers, errorHandler, language, credentials);
      const hook = (params: any) => Hook.useHook<any, TError>(requester, params);
      (requester as any).useHook = hook;
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
  THasRoutes extends boolean = false
> {
  private host?: string;
  private routes?: TRoutes;
  private prefetchCallback?: Types.PrefetchCallback;
  private postfetchCallback?: Types.PostfetchCallback<any, TError>;
  private defaultHeaders?: Record<string, string>;
  private errorHandler?: (response: Response) => Promise<TError>;
  private language: Language = "en";
  private credentials?: RequestCredentials;

  /**
   * Set the host URL for API requests
   */
  withHost(host: string): TapiBuilder<TRoutes, TError, true, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, true, THasRoutes>();
    builder.host = host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the route definitions with proper type inference
   */
  withRoutes<T extends Types.RouteDefinitions>(routes: T): TapiBuilder<T, TError, THasHost, true> {
    const builder = new TapiBuilder<T, TError, THasHost, true>();
    builder.host = this.host;
    builder.routes = routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the error handler with proper type inference
   */
  withApiError<T>(errorHandler: (response: Response) => Promise<T>): TapiBuilder<TRoutes, T, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, T, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = undefined; // Reset postfetch as error type changed
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the prefetch callback that runs before each request
   */
  withPrefetch(callback: Types.PrefetchCallback): TapiBuilder<TRoutes, TError, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = callback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the postfetch callback that runs after each request
   */
  withPostfetch(callback: Types.PostfetchCallback<any, TError>): TapiBuilder<TRoutes, TError, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = callback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set default headers for all requests
   */
  withDefaultHeaders(headers: Record<string, string>): TapiBuilder<TRoutes, TError, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = headers;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the language for error messages
   */
  withLanguage(language: Language): TapiBuilder<TRoutes, TError, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = language;
    builder.credentials = this.credentials;
    return builder;
  }

  /**
   * Set the credentials mode for all requests (e.g. "include" for cross-origin cookies)
   */
  withCredentials(credentials: RequestCredentials): TapiBuilder<TRoutes, TError, THasHost, THasRoutes> {
    const builder = new TapiBuilder<TRoutes, TError, THasHost, THasRoutes>();
    builder.host = this.host;
    builder.routes = this.routes;
    builder.prefetchCallback = this.prefetchCallback;
    builder.postfetchCallback = this.postfetchCallback;
    builder.defaultHeaders = this.defaultHeaders;
    builder.errorHandler = this.errorHandler;
    builder.language = this.language;
    builder.credentials = credentials;
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
    ...args: THasHost extends false
      ? ["Host is required - use .withHost() first"]
      : THasRoutes extends false
        ? ["Routes are required - use .withRoutes() first"]
        : []
  ): THasHost extends true ? (THasRoutes extends true ? GenerateApiMethods<TRoutes, TError> : never) : never {
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
      this.credentials
    );
    return apiMethods as any;
  }
}
