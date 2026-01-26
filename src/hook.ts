import { useCallback, useEffect, useRef, useState } from "react";

import isEqual from "react-fast-compare";

import * as ResponseSchema from "./response";
import * as Types from "./types";

function hasAnyUndefined(obj: any): boolean {
  if (obj === undefined) return true;
  if (typeof obj !== "object" || obj === null) return false;
  for (const key in obj) {
    if (hasAnyUndefined(obj[key])) return true;
  }
  return false;
}

function useDeepCompareMemo<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!isEqual(value, ref.current)) ref.current = value;
  return ref.current;
}

function useDeepCompareCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T {
  const memoDeps = useDeepCompareMemo(deps);
  return useCallback(fn, memoDeps);
}

export type RefreshFunction = (resetState?: boolean) => Promise<boolean>;
type SetterFunction<T> = (callback: (prev: T) => T) => void;

export type HookResponse<T extends Types.RequestConfig<any, any, any, any, any, any, any, any, any>, TError = string> =
  | [ResponseSchema.InferResult<T["response"]>, null, false, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>]
  | [null, Types.Errors<TError>, false, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>]
  | [null, null, true, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>];

export function useHook<T extends Types.RequestConfig<any, any, any, any, any, any, any, any, any>, TError = string>(
  requester: Types.RequesterFunction<T, TError>,
  callParams: Types.CallSignature<T> & { lazy?: boolean }
): HookResponse<T, TError> {
  const [unmappedData, setUnmappedData] = useState(null);
  const [mappedData, setMappedData] = useState<unknown | null>(null);
  const [error, setError] = useState<Types.Errors<TError> | null>(null);
  const [loading, setLoading] = useState(true);

  const requestParams = useDeepCompareMemo({
    body: callParams.body,
    query: callParams.query,
    headers: callParams.headers,
    path: callParams.path
  });

  const mapperParams = useDeepCompareMemo(callParams.map);

  const fetchData = useDeepCompareCallback(async () => {
    const result = await requester({ ...callParams, skipMapper: true, preventFetchingWithUndefinedParams: true });

    if (!result.ok) {
      if (result.status === "undefined_param") {
        setLoading(true);
        setUnmappedData(null);
        setMappedData(null);
        setError(null);
        return true;
      }

      setUnmappedData(null);
      setMappedData(null);
      setError(result as Types.Errors<TError>);
      setLoading(false);
      return false;
    }

    const mapper = (requester as any).mapper as any;
    const mappedData = mapper ? mapper(result.data)(mapperParams) : result.data;
    setUnmappedData(result.data);
    setMappedData(mappedData);
    setError(null);
    setLoading(false);
    return true;
  }, [requester, requestParams]);

  useEffect(() => {
    // Only fetch data automatically if not in lazy mode
    if (!callParams.lazy) {
      fetchData();
    }
  }, [fetchData, callParams.lazy]);

  useEffect(() => {
    if (unmappedData) {
      const mapper = (requester as any).mapper as any;
      if (mapper) {
        setMappedData(mapper(unmappedData)(mapperParams));
      } else {
        setMappedData(unmappedData);
      }
    }
  }, [mapperParams]);

  const setter = useCallback(
    (callback: (prev: ResponseSchema.InferResult<T["response"]>) => ResponseSchema.InferResult<T["response"]>) => {
      setMappedData((prev: any) => {
        if (prev === null) return null;

        const next = callback(prev);

        const mapper = (requester as any).mapper as any;
        if (mapper) return mapper(next)(mapperParams);

        return next;
      });
    },
    [mapperParams]
  );

  async function refresh(resetState?: boolean): Promise<boolean> {
    if (resetState) {
      setLoading(true);
      setUnmappedData(null);
      setMappedData(null);
      setError(null);
    }

    return await fetchData();
  }

  return [mappedData, error, loading, refresh, setter] as HookResponse<T, TError>;
}
