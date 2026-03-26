export type SseConnectionStatus = "connecting" | "open" | "error" | "stopped";

export type SseConnection = {
  connect: () => void;
  stop: () => void;
  status: () => SseConnectionStatus;
};

export function buildSseUrl(
  host: string,
  endpoint: string,
  params: { path?: Record<string, string>; query?: Record<string, string> }
): string {
  let url = endpoint;

  if (params.path) {
    for (const [key, value] of Object.entries(params.path)) {
      url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    }
  }

  const queryString = params.query
    ? `?${new URLSearchParams(params.query).toString()}`
    : "";

  return `${host}${url}${queryString}`;
}

export function createConnection<T>(
  url: string,
  callback: (data: T) => void,
  onError?: (error: Event) => void,
  withCredentials?: boolean
): SseConnection {
  let eventSource: EventSource | null = null;

  function wire(es: EventSource) {
    es.onmessage = (event) => {
      try {
        callback(JSON.parse(event.data) as T);
      } catch {
        onError?.(event);
      }
    };

    es.onerror = (event) => {
      onError?.(event);
    };
  }

  return {
    connect: () => {
      eventSource?.close();
      eventSource = new EventSource(url, { withCredentials: withCredentials ?? false });
      wire(eventSource);
    },
    stop: () => {
      eventSource?.close();
      eventSource = null;
    },
    status: () => {
      if (!eventSource) return "stopped";
      if (eventSource.readyState === EventSource.OPEN) return "open";
      if (eventSource.readyState === EventSource.CLOSED) return "error";
      return "connecting";
    },
  };
}
