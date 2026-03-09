import { useCallback, useEffect, useRef, useState } from "react";

import isEqual from "react-fast-compare";

import * as ResponseSchema from "./response";
import * as Sse from "./sse";
import * as Types from "./types";

function useDeepCompareMemo<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!isEqual(value, ref.current)) ref.current = value;
  return ref.current;
}

export type SseHookResponse<T extends Types.SseConfig<any, any, any>> =
  | [ResponseSchema.InferResult<T["response"]>, null, false, () => void]
  | [null, Error, false, () => void]
  | [null, null, true, () => void];

export function useSseHook<T extends Types.SseConfig<any, any, any>>(
  host: string,
  config: T,
  callParams: Types.SseCallSignature<T> | null
): SseHookResponse<T> {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<(() => void) | null>(null);

  const memoizedParams = useDeepCompareMemo(callParams);

  useEffect(() => {
    if (!memoizedParams) return;

    setLoading(true);
    setData(null);
    setError(null);

    const url = Sse.buildSseUrl(host, config.endpoint, memoizedParams);

    const close = Sse.createConnection(
      url,
      (parsed: any) => {
        setData(parsed);
        setError(null);
        setLoading(false);
      },
      () => {
        setError(new Error("SSE connection error"));
        setLoading(false);
      }
    );

    closeRef.current = close;
    return close;
  }, [host, config.endpoint, memoizedParams]);

  const close = useCallback(() => {
    closeRef.current?.();
  }, []);

  return [data, error, loading, close] as SseHookResponse<T>;
}
