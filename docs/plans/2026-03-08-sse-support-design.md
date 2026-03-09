# SSE Support Design

## Summary

Add Server-Sent Events support to tapi with a new `Tapi.sse` factory function, callback-based direct calls, and a `useHook` that auto-updates on each event.

## Route Definition

New factory function parallel to `Tapi.get`, `Tapi.post`, etc.:

```typescript
Tapi.sse<{ path: { roomId: string }; response: Message }>()({ endpoint: "/rooms/:roomId/events" })
```

`response` represents the shape of each individual event's JSON payload.

## Direct Call — Callback-based

```typescript
const close = api.chat.events({ path: { roomId: "123" } }, (data) => {
  // data is typed as Message
  console.log(data)
})

// later...
close()
```

- Returns a `() => void` close function
- Auto-reconnects on drop (respects SSE `retry` field, default ~3s)
- Parses every `data:` field as JSON, calls the callback with the typed result

## useHook — Latest event only

```typescript
const [data, error, loading, close] = api.chat.events.useHook({ path: { roomId: "123" } })
```

Returns a 4-tuple:

- `data: T | null` — latest event payload, null until first event
- `error: Error | null` — connection error
- `loading: boolean` — true until first event arrives
- `close: () => void` — stops the connection

Supports `null` params for chaining:

```typescript
const [room] = api.rooms.get.useHook({ path: { id } })
const [messages, error, loading, close] = api.chat.events.useHook(
  !room ? null : { path: { roomId: room.id } }
)
```

Auto-closes on unmount. Auto-reconnects on connection drop.

## Implementation Details

- Uses native `EventSource` API
- Reconnect logic: on error, wait `retry` ms (default 3000), reopen
- Each event: `JSON.parse(event.data)` -> callback / setState
- No new dependencies

## Decisions

- SSE routes use a dedicated `Tapi.sse()` factory (not a flag on `Tapi.get`)
- Direct call is callback-based, returns a close function
- Auto-reconnect by default
- Only delivers parsed JSON data (no event type metadata)
- Hook stores only the latest event (no accumulation)
- Hook returns 4-tuple: `[data, error, loading, close]`

---

# SSE Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SSE route support to tapi with `Tapi.sse()` factory, callback-based direct calls, and auto-updating `useHook`.

**Architecture:** New `SseConfig` type parallel to `RequestConfig`. New `sse.ts` module for EventSource connection management. New `sse-hook.ts` for the React hook. Wire both into `core.ts` via `isSseConfig` detection.

**Tech Stack:** Native EventSource API, React hooks, TypeScript generics.

---

### Task 1: Add SSE types to types.ts

**Files:**
- Modify: `src/types.ts:1-72`

**Step 1: Add SseConfig type**

Add after `RequestConfig` (after line 24):

```typescript
export type SseConfig<
  TPath = undefined,
  TQuery = undefined,
  TResponse = unknown
> = {
  type: "sse";
  endpoint: string;
  response: ResponseSchema.ResponseConfig<TResponse>;
};
```

**Step 2: Add SSE call signature**

Add after `CallSignature` (after line 54):

```typescript
type ExtractSsePath<T> = T extends SseConfig<infer P, any, any> ? P : undefined;
type ExtractSseQuery<T> = T extends SseConfig<any, infer Q, any> ? Q : undefined;

export type SseCallSignature<T extends SseConfig<any, any, any>> =
  InferPathParam<ExtractSsePath<T>> & InferQueryParam<ExtractSseQuery<T>>;
```

**Step 3: Add SSE listener function type**

Add after `SseCallSignature`:

```typescript
export type SseListenerFunction<TConfig extends SseConfig<any, any, any>> = (
  params: SseCallSignature<TConfig>,
  callback: (data: ResponseSchema.InferResult<TConfig["response"]>) => void
) => () => void;
```

**Step 4: Update RouteDefinitions to include SSE**

Change:
```typescript
export type RouteDefinitions = {
  [key: string]: RequestConfig<any, any, any, any, any, any, any> | RouteDefinitions;
};
```

To:
```typescript
export type RouteDefinitions = {
  [key: string]: RequestConfig<any, any, any, any, any, any, any> | SseConfig<any, any, any> | RouteDefinitions;
};
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/types.ts
git commit -m "feat: add SSE types (SseConfig, SseCallSignature, SseListenerFunction)"
```

---

### Task 2: Add SSE endpoint factory to endpoints.ts

**Files:**
- Modify: `src/endpoints.ts:1-91`

**Step 1: Add SSE endpoint types and factory**

Add after `createEndpointFactory` (after line 74), before the individual factories:

```typescript
type SseEndpointTypes<
  TPath = undefined,
  TQuery = undefined,
  TResponse = unknown
> = {
  path?: TPath;
  query?: TQuery;
  response?: TResponse;
};

type ExtractSsePath<T> = T extends { path: infer P } ? P : undefined;
type ExtractSseQuery<T> = T extends { query: infer Q } ? Q : undefined;
type ExtractSseResponse<T> = T extends { response: infer R } ? R : unknown;

function createSseEndpointFactory() {
  return <T extends SseEndpointTypes<any, any, any> = {}>() =>
    (
      config: { endpoint: string }
    ): SseConfig<
      ExtractSsePath<T>,
      ExtractSseQuery<T>,
      ExtractSseResponse<T>
    > => ({
      type: "sse" as const,
      endpoint: config.endpoint,
      response: {},
    });
}

export const sse = createSseEndpointFactory();
```

**Step 2: Add SseConfig import**

Add to the import at line 1:
```typescript
import type { HttpMethod, RequestConfig, SseConfig } from "./types";
```

**Step 3: Add sse to Endpoints namespace**

Update `Endpoints` object:
```typescript
export const Endpoints = {
  get,
  post,
  put,
  delete: del,
  patch,
  sse
} as const;
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/endpoints.ts
git commit -m "feat: add Tapi.sse() endpoint factory"
```

---

### Task 3: Create SSE connection module

**Files:**
- Create: `src/sse.ts`

**Step 1: Create sse.ts**

```typescript
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
    callback(JSON.parse(event.data) as T);
  };

  eventSource.onerror = (event) => {
    onError?.(event);
    // EventSource auto-reconnects natively
  };

  return () => eventSource.close();
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/sse.ts
git commit -m "feat: add SSE connection module with auto-reconnect"
```

---

### Task 4: Create SSE React hook

**Files:**
- Create: `src/sse-hook.ts`

**Step 1: Create sse-hook.ts**

```typescript
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
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/sse-hook.ts
git commit -m "feat: add SSE React hook with auto-close on unmount"
```

---

### Task 5: Wire SSE into core.ts

**Files:**
- Modify: `src/core.ts:1-233`

**Step 1: Add imports**

Add to imports at top:
```typescript
import * as Sse from "./sse";
import * as SseHook from "./sse-hook";
```

**Step 2: Add SseRouteFunction type**

Add after `RouteFunction` type (after line 8):

```typescript
type SseRouteFunction<T extends Types.SseConfig<any, any, any>> = Types.SseListenerFunction<T> & {
  useHook: (params: Types.SseCallSignature<T> | null) => SseHook.SseHookResponse<T>;
};
```

**Step 3: Update GenerateApiMethods**

Change:
```typescript
export type GenerateApiMethods<T extends Types.RouteDefinitions, TError = string> = {
  [K in keyof T]: T[K] extends Types.RequestConfig<any, any, any, any, any, any, any>
    ? RouteFunction<T[K], TError>
    : T[K] extends Types.RouteDefinitions
      ? GenerateApiMethods<T[K], TError>
      : never;
} & {
```

To:
```typescript
export type GenerateApiMethods<T extends Types.RouteDefinitions, TError = string> = {
  [K in keyof T]: T[K] extends Types.SseConfig<any, any, any>
    ? SseRouteFunction<T[K]>
    : T[K] extends Types.RequestConfig<any, any, any, any, any, any, any>
      ? RouteFunction<T[K], TError>
      : T[K] extends Types.RouteDefinitions
        ? GenerateApiMethods<T[K], TError>
        : never;
} & {
```

**Step 4: Add isSseConfig check**

Add after `isRequestConfig` (after line 30):

```typescript
function isSseConfig(value: unknown): value is Types.SseConfig<any, any, any> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as any;
  return v.type === "sse" && typeof v.endpoint === "string";
}
```

**Step 5: Handle SSE routes in createNestedMethods**

In the `for` loop inside `createNestedMethods`, add SSE handling before the `isRequestConfig` check (before line 50):

```typescript
    if (isSseConfig(routeValue)) {
      const sseConfig = routeValue;
      const sseFunction = (params: any, callback: (data: any) => void) => {
        const url = Sse.buildSseUrl(host, sseConfig.endpoint, params);
        return Sse.createConnection(url, callback);
      };
      (sseFunction as any).useHook = (params: any) =>
        SseHook.useSseHook(host, sseConfig, params);
      target[routeName] = sseFunction;
    } else if (isRequestConfig(routeValue)) {
```

This replaces the existing `if (isRequestConfig(routeValue))` — making it an `else if`.

**Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/core.ts
git commit -m "feat: wire SSE routes into builder and API generation"
```

---

### Task 6: Export from index.ts and update docs

**Files:**
- Modify: `src/index.ts:1-25`
- Modify: `LLM.md`

**Step 1: Add sse to Tapi object in index.ts**

Update the Tapi object:
```typescript
const Tapi = {
  builder: () => new TapiBuilder(),
  get: Endpoints.get,
  post: Endpoints.post,
  put: Endpoints.put,
  delete: Endpoints.delete,
  patch: Endpoints.patch,
  sse: Endpoints.sse
} as const;
```

**Step 2: Add SSE type exports**

Add to exports at top of index.ts:
```typescript
export type { SseConfig, SseCallSignature, SseListenerFunction } from "./types";
export type { SseHookResponse } from "./sse-hook";
```

**Step 3: Update LLM.md**

Add SSE section after `<react-hooks>` section:

```markdown
<sse>
```typescript
// Define SSE route
Tapi.sse<{ response: Message }>()({ endpoint: "/events" })
Tapi.sse<{ path: { id: string }; response: Message }>()({ endpoint: "/rooms/:id/events" })
Tapi.sse<{ query: { topic: string }; response: Message }>()({ endpoint: "/events" })

// Direct call - callback based, returns close function
const close = api.chat.events({ path: { roomId: "123" } }, (data) => {
  console.log(data) // typed as Message
})
close() // stop listening

// React hook - auto-updates on each event
const [data, error, loading, close] = api.chat.events.useHook({ path: { roomId: "123" } })

// Chain with null like regular hooks
const [room] = api.rooms.get.useHook({ path: { id } })
const [msg, error, loading, close] = api.chat.events.useHook(
  !room ? null : { path: { roomId: room.id } }
)
```
</sse>
```

Add rule 8 to `<rules>`:
```
8. SSE hooks return 4 values: `[data, error, loading, close]` — data is latest event only
```

**Step 4: Verify full build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/index.ts LLM.md
git commit -m "feat: export SSE support and update LLM guide"
```

---

### Task 7: Verify everything builds cleanly

**Step 1: Clean build**

Run: `npm run clean && npm run build`
Expected: Successful build with no errors

**Step 2: Verify dist output includes SSE files**

Run: `ls dist/sse.* dist/sse-hook.*`
Expected: `.js` and `.d.ts` files for both
