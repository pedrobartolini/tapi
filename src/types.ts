import * as ResponseSchema from "./response";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Request configuration with pure TypeScript types
 * Types are passed via generics, not runtime schemas
 */
export type ResponseType = "json" | "blob" | "text";

export type RequestConfig<
  TMethod extends HttpMethod = HttpMethod,
  TPath = undefined,
  TBody = undefined,
  TFormData = undefined,
  TQuery = undefined,
  THeaders = undefined,
  TResponse = unknown
> = {
  method: TMethod;
  endpoint: string;
  response: ResponseSchema.ResponseConfig<TResponse>;
  responseType?: ResponseType;
};

export type SseConfig<TPath = undefined, TQuery = undefined, TResponse = unknown> = {
  type: "sse";
  endpoint: string;
  response: ResponseSchema.ResponseConfig<TResponse>;
};

export type RouteDefinitions = {
  [key: string]: RequestConfig<any, any, any, any, any, any, any> | SseConfig<any, any, any> | RouteDefinitions;
};

// Parameter inference types - check if type is defined (not undefined)
// Tuple wrapping prevents conditional type distribution over unions
type InferPathParam<TPath> = [TPath] extends [undefined] ? { path?: never } : { path: TPath };
type InferBodyParam<TBody> = [TBody] extends [undefined] ? { body?: never } : { body: TBody };
type InferFormDataParam<TFormData> = [TFormData] extends [undefined] ? { formData?: never } : { formData: TFormData };
type InferQueryParam<TQuery> = [TQuery] extends [undefined] ? { query?: never } : { query: TQuery };
type InferHeaderParam<THeaders> = [THeaders] extends [undefined] ? { headers?: never } : { headers: THeaders };

// Extract types from RequestConfig
export type ExtractPath<T> = T extends RequestConfig<any, infer P, any, any, any, any, any> ? P : undefined;
type ExtractBody<T> = T extends RequestConfig<any, any, infer B, any, any, any, any> ? B : undefined;
type ExtractFormData<T> = T extends RequestConfig<any, any, any, infer F, any, any, any> ? F : undefined;
type ExtractQuery<T> = T extends RequestConfig<any, any, any, any, infer Q, any, any> ? Q : undefined;
type ExtractHeaders<T> = T extends RequestConfig<any, any, any, any, any, infer H, any> ? H : undefined;

export type RequesterParams<T extends RequestConfig<any, any, any, any, any, any, any>> = InferPathParam<ExtractPath<T>> &
  InferBodyParam<ExtractBody<T>> &
  InferFormDataParam<ExtractFormData<T>> &
  InferQueryParam<ExtractQuery<T>> &
  InferHeaderParam<ExtractHeaders<T>> & { signal?: AbortSignal };

export type CallSignature<T extends RequestConfig<any, any, any, any, any, any, any>> = InferPathParam<ExtractPath<T>> &
  InferBodyParam<ExtractBody<T>> &
  InferFormDataParam<ExtractFormData<T>> &
  InferQueryParam<ExtractQuery<T>> &
  InferHeaderParam<ExtractHeaders<T>> & { signal?: AbortSignal };

type ExtractSsePath<T> = T extends SseConfig<infer P, any, any> ? P : undefined;
type ExtractSseQuery<T> = T extends SseConfig<any, infer Q, any> ? Q : undefined;

export type SseCallSignature<T extends SseConfig<any, any, any>> = InferPathParam<ExtractSsePath<T>> & InferQueryParam<ExtractSseQuery<T>>;

export type SseListenerFunction<TConfig extends SseConfig<any, any, any>> = (
  params: SseCallSignature<TConfig>,
  callback: (data: ResponseSchema.InferResult<TConfig["response"]>) => void
) => SseConnection;

export type SseConnection = {
  connect: () => void;
  stop: () => void;
  status: () => "connecting" | "open" | "error" | "stopped";
};

// Prefetch and postfetch callback types
export type PrefetchCallback = (args: { url: string; method: HttpMethod; headers: Headers; body?: BodyInit | null }) => Promise<void> | void;
export type PostfetchCallback<TData = any, TError = any> = (response: ApiResponse<TData, TError>) => Promise<void> | void;

// Core response types
export type Success<T> = { ok: true; status: "success"; data: T };

export type NetworkError = { ok: false; code: number; status: "network_error"; message: string; error: Error };
export type CustomError<T = string> = { ok: false; code: number; status: "api_error"; message: string; data: T };
export type Errors<T = string> = NetworkError | CustomError<T>;

export type ApiResponse<TData, TError = string> = (Success<TData> | Errors<TError>) & { endpoint: string; method: HttpMethod };

export type RequesterFunction<TConfig extends RequestConfig<any, any, any, any, any, any, any>, TError = string> = (
  params: CallSignature<TConfig>
) => Promise<ApiResponse<ResponseSchema.InferResult<TConfig["response"]>, TError>>;
