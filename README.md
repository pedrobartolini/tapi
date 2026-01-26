# Tapi

A type-safe REST API client builder for TypeScript with React hooks integration.

## Features

- **Type Safety** - Full TypeScript support with compile-time type checking
- **Error as Value** - No thrown errors, all errors returned as discriminated unions
- **React Hooks** - Built-in React integration with loading states
- **Zero Runtime Validation** - Pure TypeScript types, no runtime overhead
- **Lightweight** - No external validation library dependencies
- **Auto-completion** - Full IDE support with IntelliSense
- **Internationalization** - Multi-language support for error messages

## Installation

```bash
npm install tapi
```

## Quick Start

```typescript
import Tapi from "tapi";

// 1. Define your types
type User = {
  id: number;
  name: string;
  email: string;
};

// 2. Build your API client
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError(async (res) => ({ code: res.status, message: res.statusText }))
  .withRoutes({
    users: {
      getAll: Tapi.get<{ response: User[] }>()({
        endpoint: "/users",
        response: Tapi.response<User[]>()
      }),
      getById: Tapi.get<{ path: { id: string }; response: User }>()({
        endpoint: "/users/:id",
        response: Tapi.response<User>()
      }),
      create: Tapi.post<{ body: { name: string; email: string }; response: User }>()({
        endpoint: "/users",
        response: Tapi.response<User>()
      })
    }
  })
  .build();

// 3. Use it
const result = await api.users.getAll({});
if (result.ok) {
  console.log(result.data); // Fully typed User[]
}
```

## Type Parameters

Tapi uses object-based type parameters - only specify what you need:

```typescript
// Simple - just response type
Tapi.get<{ response: User[] }>();

// With path params
Tapi.get<{ path: { id: string }; response: User }>();

// With query params
Tapi.get<{ query: { limit?: number }; response: Post[] }>();

// With body (for POST/PUT/PATCH)
Tapi.post<{ body: CreateUser; response: User }>();

// With headers
Tapi.get<{ headers: { Authorization: string }; response: User }>();

// With formData
Tapi.post<{ formData: { file: File }; response: UploadResult }>();
```

## Error Handling

All API calls return a discriminated union with an `ok` boolean:

```typescript
const result = await api.users.getById({ path: { id: "123" } });

if (result.ok) {
  console.log("User:", result.data);
} else {
  switch (result.status) {
    case "network_error":
      console.error("Network failed:", result.error);
      break;
    case "api_error":
      console.error(`API error [${result.code}]:`, result.data);
      break;
    case "mapper_error":
      console.error("Mapper failed:", result.error);
      break;
  }
}
```

## React Integration

Use the built-in React hooks for automatic loading states:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const [user, error, loading, refresh, setUser] = api.users.getById.useHook({
    path: { id: userId }
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button onClick={() => refresh()}>Refresh</button>
    </div>
  );
}
```

### Hook Return Value

```typescript
const [data, error, loading, refresh, setter] = api.endpoint.useHook(params);

// data    - The response data (null if loading or error)
// error   - The error object (null if success or loading)
// loading - Boolean loading state
// refresh - Function to refetch (pass true to reset state)
// setter  - Function to update data locally
```

### Lazy Loading

```typescript
const [user, error, loading, refresh] = api.users.getById.useHook({
  path: { id: userId },
  lazy: true // Don't fetch on mount
});

// Trigger fetch manually
<button onClick={() => refresh(true)}>Load User</button>
```

## Response Mappers

Transform API responses with type-safe mappers:

```typescript
type ApiUser = { id: number; full_name: string };
type User = { id: number; name: string };

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError(async (res) => ({ code: res.status }))
  .withRoutes({
    users: {
      getById: Tapi.get<{
        path: { id: string };
        response: ApiUser;
        mapped: User;
      }>()({
        endpoint: "/users/:id",
        response: Tapi.response<ApiUser, User>((data) => () => ({
          id: data.id,
          name: data.full_name
        }))
      })
    }
  })
  .build();

// result.data is typed as User (mapped type)
const result = await api.users.getById({ path: { id: "123" } });
```

### Mappers with Arguments

```typescript
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError(async (res) => ({ code: res.status }))
  .withRoutes({
    posts: {
      getAll: Tapi.get<{
        response: Post[];
        mapped: Post[];
        mapArg: { limit: number };
      }>()({
        endpoint: "/posts",
        response: Tapi.response<Post[], Post[], { limit: number }>((posts) => (args) => posts.slice(0, args.limit))
      })
    }
  })
  .build();

// Pass mapper arguments at call time
const result = await api.posts.getAll({ map: { limit: 5 } });
```

## Advanced Configuration

```typescript
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withApiError(async (response) => {
    const error = await response.json();
    return {
      message: error.message || "Unknown error",
      code: response.status,
      details: error
    };
  })
  .withDefaultHeaders({
    Authorization: "Bearer <token>",
    "Content-Type": "application/json"
  })
  .withPrefetch((request) => {
    console.log(`[${request.method}] ${request.url}`);
  })
  .withPostfetch((response) => {
    if (!response.ok) {
      console.error("Request failed:", response.status);
    }
  })
  .withLanguage("en") // "en" | "br"
  .withRoutes(routes)
  .build();
```

### Dynamic Headers

Update headers at runtime using `setHeaders`:

```typescript
// Update auth token
api.setHeaders({
  Authorization: `Bearer ${newToken}`
});

// Also works on nested routes
api.users.setHeaders({ ... });
```

## Internationalization

Tapi supports multiple languages for error messages:

- `"en"` - English (default)
- `"br"` - Portuguese (Brazil)

```typescript
const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withLanguage("br") // Portuguese error messages
  .withApiError(async (res) => res.statusText)
  .withRoutes(routes)
  .build();
```

## Examples

Check the `examples/` folder for comprehensive examples:

- **`tapi-example.ts`** - Complete API client with all features

## License

MIT
