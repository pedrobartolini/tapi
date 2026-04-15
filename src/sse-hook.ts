import { useCallback, useEffect, useRef, useState } from "react";

import isEqual from "react-fast-compare";

import * as Sse from "./sse";
import type * as Types from "./types";
import type * as ResponseSchema from "./response";

function useDeepCompareMemo<T>(value: T): T {
  const ref = useRef<T>(value);
  if (!isEqual(value, ref.current)) ref.current = value;
  return ref.current;
}

export type SseHookParams<T extends Types.SseConfig<any, any, any>> = Types.SseCallSignature<T> & {
  onEvent: (data: ResponseSchema.InferResult<T["response"]>) => void;
};

export type SseHookResponse = {
  status: Sse.SseConnectionStatus;
  connect: () => void;
  stop: () => void;
};

export function useSseHook<T extends Types.SseConfig<any, any, any>>(
  host: string,
  config: T,
  params: SseHookParams<T> | null,
  withCredentials?: boolean
): SseHookResponse {
  const [status, setStatus] = useState<Sse.SseConnectionStatus>("stopped");
  const connectionRef = useRef<Sse.SseConnection | null>(null);
  const onEventRef = useRef(params?.onEvent);
  onEventRef.current = params?.onEvent;

  const { onEvent: _, ...connectionParams } = params ?? {} as any;
  const memoizedParams = useDeepCompareMemo(params ? connectionParams : null);

  useEffect(() => {
    if (!memoizedParams) return;

    const url = Sse.buildSseUrl(host, config.endpoint, memoizedParams);

    const connection = Sse.createConnection(
      url,
      (parsed: any) => {
        onEventRef.current?.(parsed);
      },
      () => setStatus("error"),
      withCredentials,
      () => setStatus("open")
    );

    connectionRef.current = connection;
    return () => {
      connection.stop();
      setStatus("stopped");
    };
  }, [host, config.endpoint, memoizedParams, withCredentials]);

  const connect = useCallback(() => {
    connectionRef.current?.connect();
    setStatus("connecting");
  }, []);

  const stop = useCallback(() => {
    connectionRef.current?.stop();
    setStatus("stopped");
  }, []);

  return { status, connect, stop };
}
