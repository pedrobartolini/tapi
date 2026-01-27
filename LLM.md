# Tapi - LLM Guide

<overview>
Tapi is a lightweight, type-safe REST API client builder for TypeScript.
- Pure TypeScript generics (no Zod, no runtime validation)
- Errors as discriminated unions (not thrown)
- Built-in React hooks
</overview>

<setup>
```typescript
import Tapi from "tapi-rs";

type User = { id: number; name: string };

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError(async (res) => ({ code: res.status, message: res.statusText }))
  .withRoutes({
    users: {
      getAll: Tapi.get<{ response: User[] }>()({ endpoint: "/users" }),
      getById: Tapi.get<{ path: { id: string }; response: User }>()({ endpoint: "/users/:id" }),
      create: Tapi.post<{ body: { name: string }; response: User }>()({ endpoint: "/users" })
    }
  })
  .build();
```
</setup>

<type-parameters>
Only specify what you need:
```typescript
Tapi.get<{ response: User[] }>()                                    // response only
Tapi.get<{ path: { id: string }; response: User }>()                // path params (:id)
Tapi.get<{ query: { limit?: number }; response: User[] }>()         // query params (?limit=)
Tapi.post<{ body: CreateUser; response: User }>()                   // request body
Tapi.post<{ formData: { file: File }; response: Result }>()         // file upload
Tapi.get<{ headers: { Authorization: string }; response: User }>()  // custom headers
```
</type-parameters>

<usage>
```typescript
// Always check result.ok before accessing data
const result = await api.users.getById({ path: { id: "1" } });
if (result.ok) {
  console.log(result.data);  // typed as User
} else {
  // result.status: "network_error" | "api_error"
  console.error(result.code, result.message);
}

// Empty object required even with no params
const users = await api.users.getAll({});
```
</usage>

<react-hooks>
```typescript
// Basic usage - returns [data, error, loading, refresh, setter]
const [user, error, loading, refresh, setUser] = api.users.getById.useHook({
  path: { id: userId }
});

// Lazy loading - don't fetch on mount
const [user, , , refresh] = api.users.getById.useHook({ path: { id }, lazy: true });
<button onClick={() => refresh(true)}>Load</button>

// Chained hooks - pass null to skip fetch until ready
const [user] = api.users.getById.useHook({ path: { id: userId } });
const [posts] = api.posts.getByUser.useHook(!user ? null : { query: { userId: user.id } });

// Optimistic update
setUser((prev) => ({ ...prev, name: "New Name" }));
```
</react-hooks>

<builder-options>
```typescript
Tapi.builder()
  .withHost("https://api.example.com")           // required
  .withApiError(async (res) => res.json())       // required - parse error responses
  .withRoutes({ ... })                           // required
  .withDefaultHeaders({ Authorization: "..." })  // optional
  .withPrefetch((req) => console.log(req.url))   // optional - before request
  .withPostfetch((res) => console.log(res.ok))   // optional - after request
  .withLanguage("en")                            // optional - "en" | "br"
  .build();

// Update headers at runtime
api.setHeaders({ Authorization: `Bearer ${token}` });
```
</builder-options>

<rules>
1. Always check `result.ok` before accessing `result.data`
2. Type params are object-based: `{ response: T }` not just `T`
3. Curried syntax: `Tapi.get<Types>()({ endpoint })` (double parens)
4. Path params: `:param` in endpoint must match path type keys
5. Empty object for no params: `api.endpoint({})`
6. Hooks return 5 values: `[data, error, loading, refresh, setter]`
7. Chain hooks with null: `useHook(!ready ? null : { ... })`
</rules>
