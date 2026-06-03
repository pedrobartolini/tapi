import { useCallback, useEffect, useRef, useState } from "react";

import isEqual from "./deep-equal";

import * as ResponseSchema from "./response";
import * as Types from "./types";

function useDeepCompareMemo<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!isEqual(value, ref.current)) ref.current = value;
  return ref.current;
}

export type RefreshFunction = (resetState?: boolean) => Promise<boolean>;
type SetterFunction<T> = (callback: (prev: T) => T) => void;

export type HookResponse<T extends Types.RequestConfig<any, any, any, any, any, any, any>, TError = string> =
  | [ResponseSchema.InferResult<T["response"]>, null, false, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>]
  | [null, Types.Errors<TError>, false, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>]
  | [null, null, true, RefreshFunction, SetterFunction<ResponseSchema.InferResult<T["response"]>>];

export function useHook<T extends Types.RequestConfig<any, any, any, any, any, any, any>, TError = string>(
  requester: Types.RequesterFunction<T, TError>,
  callParams: (Types.CallSignature<T> & { lazy?: boolean }) | null
): HookResponse<T, TError> {
  const [data, setData] = useState<unknown | null>(null);
  const [error, setError] = useState<Types.Errors<TError> | null>(null);
  const [loading, setLoading] = useState(true);

  const memoizedParams = useDeepCompareMemo(callParams);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!memoizedParams) return true;

      const result = await requester({ ...memoizedParams, signal });

      if (signal?.aborted) return true;

      if (!result.ok) {
        setData(null);
        setError(result as Types.Errors<TError>);
        setLoading(false);
        return false;
      }

      setData(result.data);
      setError(null);
      setLoading(false);
      return true;
    },
    [requester, memoizedParams]
  );

  useEffect(() => {
    if (!memoizedParams) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (memoizedParams.lazy) return;

    setLoading(true);
    setData(null);
    setError(null);

    const controller = new AbortController();
    fetchData(controller.signal);

    return () => controller.abort();
  }, [fetchData, memoizedParams]);

  const setter = useCallback((callback: (prev: ResponseSchema.InferResult<T["response"]>) => ResponseSchema.InferResult<T["response"]>) => {
    setData((prev: any) => {
      if (prev === null) return null;
      return callback(prev);
    });
  }, []);

  async function refresh(resetState?: boolean): Promise<boolean> {
    if (!memoizedParams) return true;

    if (resetState) {
      setLoading(true);
      setData(null);
      setError(null);
    }

    return await fetchData();
  }

  return [data, error, loading, refresh, setter] as HookResponse<T, TError>;
}
