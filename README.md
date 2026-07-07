# tapi

Type-safe REST API client for TypeScript with React hooks. Pure compile-time types — no runtime schemas, no codegen.

## Install

```bash
npm install tapi-rs
```

## Quick start

```ts
import Tapi from "tapi-rs"

// Define routes
const routes = {
  getUsers: Tapi.get<{ response: User[] }>()({ endpoint: "/users" }),
  getUser: Tapi.get<{ path: { id: string }; response: User }>()({ endpoint: "/users/:id" }),
  createUser: Tapi.post<{ body: CreateUser; response: User }>()({ endpoint: "/users" }),
}

// Build the client
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withRoutes(routes)
  .build()

// Make requests
const response = await api.getUser({ path: { id: "1" } })

if (response.ok) {
  console.log(response.data) // User — fully typed
}
```

## Defining routes

Each route is created with `Tapi.get`, `Tapi.post`, `Tapi.put`, `Tapi.patch`, or `Tapi.delete`. Pass a type object specifying only the params you need:

```ts
// GET with query params
Tapi.get<{
  query: { page: number; limit: number }
  response: { users: User[]; total: number }
}>()({ endpoint: "/users" })

// POST with body
Tapi.post<{
  body: { name: string; email: string }
  response: User
}>()({ endpoint: "/users" })

// PUT with path + body
Tapi.put<{
  path: { id: string }
  body: Partial<User>
  response: User
}>()({ endpoint: "/users/:id" })

// DELETE with path
Tapi.delete<{
  path: { id: string }
  response: { deleted: boolean }
}>()({ endpoint: "/users/:id" })
```

Available type params: `path`, `body`, `formData`, `query`, `headers`, `response`.

## React hooks

React is an **optional** integration. The default `tapi-rs` entry is React-free and has zero runtime dependencies — import it anywhere (Node, workers, non-React apps) without pulling in React.

To get the `.useHook()` / `.useSse()` methods on your routes, build the client from the `tapi-rs/react` entry instead:

```ts
import Tapi from "tapi-rs/react" // instead of "tapi-rs"

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withRoutes(routes)
  .build()
```

Everything else is identical — the only difference is that routes built from `tapi-rs/react` additionally expose hooks. (`react` is an optional peer dependency, so it's only required when you use this entry.)

Every route function then has a `.useHook()` method:

```tsx
function UserProfile({ userId }: { userId: string }) {
  const [user, error, loading, refresh, setUser] = api.getUser.useHook({
    path: { id: userId },
  })

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <div>
      <h1>{user.name}</h1>
      <button onClick={() => refresh()}>Refresh</button>
    </div>
  )
}
```

### Hook return value

Returns a tuple `[data, error, loading, refresh, setter]`:

| Index | Value | Type |
|-------|-------|------|
| 0 | `data` | `T \| null` — response data |
| 1 | `error` | `Errors<TError> \| null` — error details |
| 2 | `loading` | `boolean` |
| 3 | `refresh` | `(resetState?: boolean) => Promise<boolean>` |
| 4 | `setter` | `(fn: (prev: T) => T) => void` — optimistic updates |

### Skip fetching

Pass `null` to disable auto-fetching entirely:

```tsx
const [user] = api.getUser.useHook(null)
```

### Lazy mode

Pass `lazy: true` to create the hook without auto-fetching. Call `refresh()` to trigger manually:

```tsx
const [result, error, loading, submit] = api.createUser.useHook({
  body: { name: "Alice", email: "alice@example.com" },
  lazy: true,
})

// Trigger the request manually
await submit()
```

### Optimistic updates

Use the setter to update local data without refetching:

```tsx
const [users, error, loading, refresh, setUsers] = api.getUsers.useHook({})

function removeUser(id: string) {
  setUsers((prev) => prev.filter((u) => u.id !== id))
}
```

## Server-Sent Events (SSE)

Define a streaming route with `Tapi.sse`. It supports `path`, `query`, `headers`, and `response` type params — the `response` type describes the JSON payload of each event:

```ts
const routes = {
  chat: Tapi.sse<{
    path: { roomId: string }
    query: { since?: number }
    headers: { Authorization: string }
    response: { id: string; message: string }
  }>()({ endpoint: "/chat/:roomId/stream" }),
}
```

Call the route with params and a set of **lifecycle handlers** — all of them are optional:

```ts
const connection = api.chat(
  { path: { roomId: "42" }, headers: { Authorization: `Bearer ${token}` } },
  {
    onData: (event) => console.log(event.message), // typed as { id, message }
    onOpen: () => console.log("connected"),
    onError: (error) => console.error(error),
    onClose: () => console.log("stream ended"),
  }
)

connection.connect() // open the stream
connection.status() // "connecting" | "open" | "error" | "stopped"
connection.stop() // close it
```

`onData` fires per event with the JSON-parsed payload. `onError` fires on a network/HTTP failure or an unparseable payload. `onClose` fires when the server ends the stream — a manual `stop()` does not trigger it.

Unlike the native `EventSource`, tapi streams SSE over `fetch`, so custom `headers` (and `.withCredentials(...)`) work just like on any other route, including updates via `setHeaders`.

### React

Routes built from `tapi-rs/react` expose `.useSse()`, which manages the connection across the component lifecycle:

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  const { status, connect, stop } = api.chat.useSse({
    path: { roomId },
    headers: { Authorization: `Bearer ${token}` },
    onData: (event) => append(event),
  })

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={connect}>Connect</button>
      <button onClick={stop}>Stop</button>
    </div>
  )
}
```

Call `connect()` to open the stream; it tears down automatically on unmount or when params change. Pass `null` instead of params to keep the hook idle.

## Cancellation

Hooks automatically cancel in-flight requests when params change or the component unmounts — no stale responses.

For imperative calls, pass an `AbortSignal`:

```ts
const controller = new AbortController()

api.getUser({ path: { id: "1" }, signal: controller.signal })

// Cancel the request
controller.abort()
```

## Nested routes

Group related endpoints under namespaces:

```ts
const routes = {
  users: {
    list: Tapi.get<{ response: User[] }>()({ endpoint: "/users" }),
    create: Tapi.post<{ body: CreateUser; response: User }>()({ endpoint: "/users" }),
  },
  posts: {
    list: Tapi.get<{ response: Post[] }>()({ endpoint: "/posts" }),
    get: Tapi.get<{ path: { id: string }; response: Post }>()({ endpoint: "/posts/:id" }),
  },
}

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withRoutes(routes)
  .build()

const response = await api.users.list({})
const [posts] = api.posts.list.useHook({})
```

## Response handling

Every request returns an `ApiResponse` — a discriminated union you can narrow with `response.ok`:

```ts
const response = await api.getUser({ path: { id: "1" } })

if (response.ok) {
  // Success — response.data is typed
  console.log(response.data)
} else if (response.status === "api_error") {
  // Server returned an error — response.code, response.message, response.data
  console.log(response.code, response.data)
} else {
  // Network error — response.error is the original Error
  console.log(response.error)
}
```

## FormData & file uploads

Use `formData` instead of `body` for multipart requests:

```ts
const routes = {
  uploadAvatar: Tapi.post<{
    path: { userId: string }
    formData: { avatar: File; description: string }
    response: { url: string }
  }>()({ endpoint: "/users/:userId/avatar" }),
}

await api.uploadAvatar({
  path: { userId: "1" },
  formData: { avatar: file, description: "Profile picture" },
})
```

File arrays are supported — each file is appended individually to the FormData.

## Response parsing

The response body is parsed automatically from the `Content-Type` header:

- `application/json` (and `application/*+json`) → parsed JSON
- `text/*` → `string`
- anything else → `Blob` (binary)
- missing `Content-Type` → JSON

Just declare the matching `response` type — there's no `responseType` flag to set:

```ts
const routes = {
  // server returns application/pdf -> parsed as a Blob
  downloadReport: Tapi.get<{
    path: { id: string }
    response: Blob
  }>()({ endpoint: "/reports/:id/download" }),
}
```

## URL building

Every route function has a `.path()` method to build the full URL without making a request:

```ts
api.getUser.path({ id: "42" })
// => "https://api.example.com/users/42"

api.getUsers.path()
// => "https://api.example.com/users"
```

## Builder options

### Custom error handling

Parse your API's error format:

```ts
type ApiError = { code: string; details: string[] }

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError<ApiError>(async (response) => {
    const body = await response.json()
    return { code: body.error_code, details: body.messages }
  })
  .withRoutes(routes)
  .build()

const response = await api.getUser({ path: { id: "1" } })

if (!response.ok && response.status === "api_error") {
  console.log(response.data.code) // typed as ApiError
}
```

### Credentials

Set the `credentials` mode for all requests (e.g. cross-origin cookies):

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withCredentials("include")
  .withRoutes(routes)
  .build()
```

### Default headers

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withDefaultHeaders({ Authorization: "Bearer token" })
  .withRoutes(routes)
  .build()

// Update headers at runtime
api.setHeaders({ Authorization: "Bearer new-token" })
```

### Prefetch callback

Runs before every request — useful for injecting auth:

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withPrefetch(async ({ url, method, headers }) => {
    const token = await getAccessToken()
    headers.set("Authorization", `Bearer ${token}`)
  })
  .withRoutes(routes)
  .build()
```

### Postfetch callback

Runs after every request — useful for logging or global error handling:

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withPostfetch((response) => {
    if (!response.ok && response.code === 401) {
      redirectToLogin()
    }
  })
  .withRoutes(routes)
  .build()
```

### Language

Error messages support `"en"` (default) and `"br"` (Brazilian Portuguese):

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withLanguage("br")
  .withRoutes(routes)
  .build()
```

### GET dedupe

Callers have no shared cache — a screen composing several components that read the same resource (hooks, name-resolution cells, pickers) fires the same GET 2-3× within milliseconds. `withGetDedupe` collapses identical GETs fired within `ttlMs` milliseconds (default 1000) into a single network request:

```ts
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withGetDedupe(1000)
  .withRoutes(routes)
  .build()
```

Semantics:

- Every caller receives its own clone of the shared response — bodies parse independently.
- Request headers participate in the dedupe key, so updated credentials (e.g. via `setHeaders`) are never served another identity's response.
- Any non-GET clears the window once it settles: a refetch awaited after a mutation always hits the network.
- Non-ok responses are shared while in flight but never served after arrival — retries refetch.
- Deduped requests drop per-caller abort signals (one consumer aborting must not cancel the others); pre-aborted calls keep native semantics. SSE is unaffected.

## Types

```ts
import type { ApiResponse, Success, CustomError, NetworkError, Errors } from "tapi-rs"

// ApiResponse<TData, TError> = (Success<TData> | Errors<TError>) & { endpoint: string; method: HttpMethod }
// Success<T> = { ok: true; status: "success"; data: T }
// CustomError<T> = { ok: false; code: number; status: "api_error"; message: string; data: T }
// NetworkError = { ok: false; code: number; status: "network_error"; message: string; error: Error }
// Errors<T> = NetworkError | CustomError<T>
```

## License

MIT
