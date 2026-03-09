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
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      callback(JSON.parse(event.data) as T);
    } catch {
      onError?.(event);
    }
  };

  eventSource.onerror = (event) => {
    onError?.(event);
    // EventSource auto-reconnects natively
  };

  return () => eventSource.close();
}
