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
