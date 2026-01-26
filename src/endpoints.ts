import type { HttpMethod, RequestConfig } from "./types";
import type { ResponseConfig } from "./response";

/**
 * Configuration object for endpoint factories
 */
type EndpointOptions<TResponse, TMapped, TMapArg> = {
  endpoint: string;
  response: ResponseConfig<TResponse, TMapped, TMapArg>;
};

/**
 * Type parameters object - only specify what you need
 */
type EndpointTypes<
  TPath = undefined,
  TBody = undefined,
  TFormData = undefined,
  TQuery = undefined,
  THeaders = undefined,
  TResponse = unknown,
  TMapped = TResponse,
  TMapArg = undefined
> = {
  path?: TPath;
  body?: TBody;
  formData?: TFormData;
  query?: TQuery;
  headers?: THeaders;
  response?: TResponse;
  mapped?: TMapped;
  mapArg?: TMapArg;
};

/**
 * Extract types from the config object with defaults
 */
type ExtractPath<T> = T extends { path: infer P } ? P : undefined;
type ExtractBody<T> = T extends { body: infer B } ? B : undefined;
type ExtractFormData<T> = T extends { formData: infer F } ? F : undefined;
type ExtractQuery<T> = T extends { query: infer Q } ? Q : undefined;
type ExtractHeaders<T> = T extends { headers: infer H } ? H : undefined;
type ExtractResponse<T> = T extends { response: infer R } ? R : unknown;
type ExtractMapped<T> = T extends { mapped: infer M } ? M : ExtractResponse<T>;
type ExtractMapArg<T> = T extends { mapArg: infer A } ? A : undefined;

/**
 * Curried endpoint factory using object-based type parameters
 *
 * Usage:
 *   // Simple - just response type
 *   Tapi.get<{ response: User[] }>()({ endpoint: "/users", response: Tapi.response<User[]>() })
 *
 *   // With path params
 *   Tapi.get<{ path: { id: string }, response: User }>()({ endpoint: "/users/:id", response: Tapi.response<User>() })
 *
 *   // With query params
 *   Tapi.get<{ query: { limit?: number }, response: Post[] }>()({ endpoint: "/posts", response: Tapi.response<Post[]>() })
 *
 *   // With body (for POST/PUT)
 *   Tapi.post<{ body: CreateUser, response: User }>()({ endpoint: "/users", response: Tapi.response<User>() })
 *
 *   // With mapper
 *   Tapi.get<{ path: { id: string }, response: User, mapped: UserDTO }>()({
 *     endpoint: "/users/:id",
 *     response: Tapi.response<User, UserDTO>((u) => () => ({ ...u, fullName: u.name }))
 *   })
 */
function createEndpointFactory<TMethod extends HttpMethod>(method: TMethod) {
  return <T extends EndpointTypes<any, any, any, any, any, any, any, any> = {}>() =>
    (
      config: EndpointOptions<ExtractResponse<T>, ExtractMapped<T>, ExtractMapArg<T>>
    ): RequestConfig<
      TMethod,
      ExtractPath<T>,
      ExtractBody<T>,
      ExtractFormData<T>,
      ExtractQuery<T>,
      ExtractHeaders<T>,
      ExtractResponse<T>,
      ExtractMapped<T>,
      ExtractMapArg<T>
    > => ({
      method,
      endpoint: config.endpoint,
      response: config.response
    });
}

// Individual endpoint factories
export const get = createEndpointFactory("GET");
export const post = createEndpointFactory("POST");
export const put = createEndpointFactory("PUT");
export const del = createEndpointFactory("DELETE");
export const patch = createEndpointFactory("PATCH");

// Namespace export
export const Endpoints = {
  get,
  post,
  put,
  delete: del,
  patch
} as const;
