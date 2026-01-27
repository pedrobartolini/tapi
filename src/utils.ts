import * as Errors from "./errors";
import { Language, t } from "./translations";
import * as Types from "./types";

export function buildUrl<T extends Types.RequestConfig<any, any, any, any, any, any, any>>(host: string, config: T, params: Types.RequesterParams<T>): string {
  let url = config.endpoint;

  // Replace path parameters
  if (params.path) {
    for (const [key, value] of Object.entries(params.path as Record<string, string>)) {
      url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    }
  }

  // Add query parameters
  const queryString = params.query ? `?${new URLSearchParams(params.query as Record<string, string>).toString()}` : "";

  return `${host}${url}${queryString}`;
}

export async function executeRequest<T extends Types.RequestConfig<any, any, any, any, any, any, any>>(
  url: string,
  config: T,
  params: Types.RequesterParams<T>,
  defaultHeaders?: Record<string, string>,
  language: Language = "en"
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
      if (value instanceof Array) {
        if (value.length !== 0 && value[0] instanceof File) {
          for (const item of value) {
            (body as FormData).append(key, item);
          }
          continue;
        }
      }
      (body as FormData).append(key, value as string | Blob);
    }
  } else if (params.body) {
    // Handle JSON body
    body = JSON.stringify(params.body);
    headers.append("Content-Type", "application/json");
  }

  try {
    return await fetch(url, { method: config.method, headers, body });
  } catch (error) {
    return Errors.createNetworkError(translations.errors.requestFailed, error instanceof Error ? error : new Error(String(error)));
  }
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
    try {
      const errorText = await response.json();
      if (typeof errorText === "string") {
        data = errorText as TError;
        message = errorText;
      } else {
        throw new Error(translations.errors.invalidErrorFormat);
      }
    } catch {
      data = `API error ${response.status}: ${response.statusText}` as TError;
      message = `API error ${response.status}: ${response.statusText}`;
    }
  }

  return Errors.createCustomError(message, data, response.status);
}
