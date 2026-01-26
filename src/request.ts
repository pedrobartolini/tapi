import * as Errors from "./errors";
import * as ResponseSchema from "./response";
import { Language, t } from "./translations";
import * as Types from "./types";
import * as Utils from "./utils";

function hasAnyUndefined(obj: any): boolean {
  if (obj === undefined) return true;
  if (typeof obj !== "object" || obj === null) return false;
  for (const key in obj) {
    if (hasAnyUndefined(obj[key])) return true;
  }
  return false;
}

function dispatchPostFetchCallback(callback?: Types.PostfetchCallback, args?: any): void {
  if (callback) {
    Promise.resolve()
      .then(() => callback(args))
      .catch(() => {});
  }
}

export function create<TConfig extends Types.RequestConfig<any, any, any, any, any, any, any, any, any>, TError = string>(
  host: string,
  config: TConfig,
  prefetchCallback: Types.PrefetchCallback | undefined,
  postfetchCallback: Types.PostfetchCallback<ResponseSchema.InferResult<TConfig["response"]>, TError> | undefined,
  defaultHeaders: Record<string, string> | undefined,
  errorHandler: (response: Response) => Promise<TError>,
  language: Language = "en"
): Types.RequesterFunction<TConfig, TError> {
  const translations = t(language);

  const requester = async function (params: Types.CallSignature<TConfig>) {
    const promise = async (): Promise<Types.ApiResponse<ResponseSchema.InferResult<TConfig["response"]>, TError>> => {
      try {
        // Check for undefined parameters if requested
        if (params.preventFetchingWithUndefinedParams && hasAnyUndefined(params)) {
          const undefinedError = Errors.createUndefinedParamError(translations.errors.undefinedParams, 400);
          const nError = { ...undefinedError, endpoint: config.endpoint, method: config.method };
          dispatchPostFetchCallback(postfetchCallback, nError);
          return nError;
        }

        const url = Utils.buildUrl(host, config, params);

        // Prepare request details for prefetchCallback
        const headers = new Headers({ ...(defaultHeaders || {}) });
        if (params.headers) {
          for (const [key, value] of Object.entries(params.headers as Record<string, string>)) {
            headers.append(key, String(value));
          }
        }

        let body: BodyInit | null = null;
        if (params.formData) {
          body = new FormData();
          for (const [key, value] of Object.entries(params.formData as Record<string, any>)) {
            if (value instanceof Array) {
              if (value.length !== 0 && value[0] instanceof File) {
                for (const item of value) (body as FormData).append(key, item);
                continue;
              }
            }
            (body as FormData).append(key, value as string | Blob);
          }
        } else if (params.body) {
          body = JSON.stringify(params.body);
          headers.append("Content-Type", "application/json");
        }

        // Call prefetchCallback if provided
        if (prefetchCallback) {
          await Promise.resolve(prefetchCallback({ url, method: config.method, headers, body }));
        }

        const responseOrError = await Utils.executeRequest(url, config, params, defaultHeaders, language);
        if ("error" in responseOrError) {
          const nError = { ...responseOrError, endpoint: url, method: config.method };
          dispatchPostFetchCallback(postfetchCallback, nError);
          return nError;
        }

        const response = responseOrError;
        if (!response.ok) {
          const errorResponse = await Utils.handleErrorResponse(response, errorHandler, language);
          const nError = { ...errorResponse, endpoint: url, method: config.method };
          dispatchPostFetchCallback(postfetchCallback, nError);
          return nError;
        }

        // Parse response data (no validation, trust the types)
        const data = await response.json();

        // Apply mapper if present and not skipped
        let resultData = data;
        if (!params.skipMapper && config.response.mapper) {
          try {
            resultData = config.response.mapper(data)(params.map);
          } catch (error) {
            const mapperError = Errors.createMapperError(translations.errors.mapperError, error instanceof Error ? error : new Error(String(error)));
            const nError = { ...mapperError, endpoint: config.endpoint, method: config.method };
            dispatchPostFetchCallback(postfetchCallback, nError);
            return nError;
          }
        }

        const successResult = Errors.createSuccess(resultData);
        const nResult = { ...successResult, endpoint: config.endpoint, method: config.method };
        dispatchPostFetchCallback(postfetchCallback, nResult);
        return nResult;
      } catch (error) {
        const networkError = Errors.createNetworkError(translations.errors.requestFailed, error instanceof Error ? error : new Error(String(error)));
        const nError = { ...networkError, endpoint: config.endpoint, method: config.method };
        dispatchPostFetchCallback(postfetchCallback, nError);
        return nError;
      }
    };

    return await promise();
  };

  requester.mapper = config.response.mapper;
  return requester as Types.RequesterFunction<TConfig, TError>;
}
