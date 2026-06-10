import * as Errors from "./errors";
import { Language, t } from "./translations";
import * as Types from "./types";

/**
 * Append a query param as encoded `key=value` segments, recursing into arrays
 * (`key[0]`) and objects (`key[sub]`) to match serde_qs bracket nesting.
 *
 * A nested `null` is emitted as a bare valueless key (`a[k]`, no `=`), which
 * serde_qs parses as `None` — this keeps map entries whose value means "no
 * restriction". Skipping it (like `undefined`, or a top-level `null`) would
 * drop the map key entirely. URLSearchParams cannot produce a key without
 * `=`, hence the manual segment building.
 */
export function appendQueryParam(out: string[], key: string, value: unknown, nested = false): void {
  if (value === undefined) return;
  if (value === null) {
    if (nested) out.push(encodeURIComponent(key));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendQueryParam(out, `${key}[${i}]`, item, true));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      appendQueryParam(out, `${key}[${k}]`, v, true);
    }
    return;
  }
  out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

/**
 * Append a single value to a FormData body. Blobs/Files are sent as binary
 * parts and strings/numbers/booleans as-is, but nested objects are serialized
 * to JSON so a typed struct field (e.g. a tagged union) can travel as one
 * multipart part and be parsed server-side. Without this, `FormData.append`
 * coerces an object to the literal string "[object Object]".
 */
export function appendFormField(form: FormData, key: string, value: unknown): void {
  if (value instanceof Blob) {
    form.append(key, value);
    return;
  }
  if (typeof value === "string") {
    form.append(key, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    form.append(key, String(value));
    return;
  }
  form.append(key, JSON.stringify(value));
}

export function buildUrl<T extends Types.RequestConfig<any, any, any, any, any, any, any>>(host: string, config: T, params: Types.RequesterParams<T>): string {
  let url = config.endpoint;

  // Replace path parameters
  if (params.path) {
    for (const [key, value] of Object.entries(params.path as Record<string, string>)) {
      url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    }
  }

  let queryString = "";
  if (params.query) {
    const segments: string[] = [];
    for (const [key, value] of Object.entries(params.query as Record<string, unknown>)) {
      appendQueryParam(segments, key, value);
    }
    if (segments.length) queryString = `?${segments.join("&")}`;
  }

  return `${host}${url}${queryString}`;
}

export async function executeRequest<T extends Types.RequestConfig<any, any, any, any, any, any, any>>(
  url: string,
  config: T,
  params: Types.RequesterParams<T>,
  defaultHeaders?: Record<string, string>,
  language: Language = "en",
  credentials?: RequestCredentials
): Promise<Response | Types.NetworkError> {
  const translations = t(language);
  const headers = new Headers({ ...defaultHeaders });

  // Add custom headers from params
  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers as Record<string, string>)) {
      headers.append(key, String(value));
    }
  }

  let body: BodyInit | undefined;

  // Handle FormData
  if (params.formData) {
    body = new FormData();
    for (const [key, value] of Object.entries(params.formData as Record<string, any>)) {
      if (value === null || value === undefined) continue;
      if (value instanceof Array) {
        for (const item of value) {
          if (item === null || item === undefined) continue;
          appendFormField(body as FormData, key, item);
        }
        continue;
      }
      appendFormField(body as FormData, key, value);
    }
  } else if (params.body) {
    // Handle JSON body
    body = JSON.stringify(params.body);
    headers.append("Content-Type", "application/json");
  }

  try {
    return await fetch(url, { method: config.method, headers, body, signal: params.signal, credentials });
  } catch (error) {
    return Errors.createNetworkError(translations.errors.requestFailed, error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Parse a successful response body based on its Content-Type header.
 * - JSON content types (`application/json`, `application/*+json`) -> parsed object
 * - `text/*` -> string
 * - anything else with a Content-Type -> Blob (binary)
 * - missing/empty Content-Type -> JSON (preserves the common-case default)
 */
export async function parseResponseBody(response: Response): Promise<any> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType) return response.json();
  if (contentType.includes("application/json") || contentType.includes("+json")) return response.json();
  if (contentType.startsWith("text/")) return response.text();
  return response.blob();
}

export async function handleErrorResponse<TError = string>(
  response: Response,
  errorHandler?: (response: Response) => Promise<TError>,
  language: Language = "en"
): Promise<Types.CustomError<TError>> {
  const translations = t(language);
  let data: TError;
  let message: string;

  if (errorHandler) {
    try {
      data = await errorHandler(response);
      message = `API error ${response.status}: ${response.statusText}`;
    } catch (error) {
      data = `Failed to parse error response: ${error}` as TError;
      message = `API error ${response.status}: ${response.statusText}`;
    }
  } else {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (typeof json === "string") {
        data = json as TError;
        message = json;
      } else {
        data = json as TError;
        message = `API error ${response.status}: ${response.statusText}`;
      }
    } catch {
      data = (text || `API error ${response.status}: ${response.statusText}`) as TError;
      message = text || `API error ${response.status}: ${response.statusText}`;
    }
  }

  return Errors.createCustomError(message, data, response.status);
}
