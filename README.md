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

Every route function has a `.useHook()` method:

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

## Blob responses

Set `responseType: "blob"` for binary data:

```ts
const routes = {
  downloadReport: Tapi.get<{
    path: { id: string }
    response: Blob
  }>()({ endpoint: "/reports/:id/download", responseType: "blob" }),
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
