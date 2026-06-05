// React-enabled entry: built routes expose `.useHook` / `.useSse`.
// For non-React usage, import from "tapi-rs" instead (no React dependency).
import Tapi from "tapi-rs/react"

// ─── Types ───────────────────────────────────────────────────────────

type User = {
  id: string
  name: string
  email: string
  role: "admin" | "user"
}

type CreateUser = {
  name: string
  email: string
}

type Post = {
  id: string
  title: string
  body: string
  authorId: string
}

type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
}

type ApiError = {
  code: string
  details: string[]
}

// ─── Routes ──────────────────────────────────────────────────────────

const routes = {
  users: {
    list: Tapi.get<{
      query: { page?: number; limit?: number; role?: User["role"] }
      response: PaginatedResponse<User>
    }>()({ endpoint: "/users" }),

    get: Tapi.get<{
      path: { id: string }
      response: User
    }>()({ endpoint: "/users/:id" }),

    create: Tapi.post<{
      body: CreateUser
      response: User
    }>()({ endpoint: "/users" }),

    update: Tapi.put<{
      path: { id: string }
      body: Partial<CreateUser>
      response: User
    }>()({ endpoint: "/users/:id" }),

    delete: Tapi.delete<{
      path: { id: string }
      response: { deleted: boolean }
    }>()({ endpoint: "/users/:id" }),

    uploadAvatar: Tapi.post<{
      path: { id: string }
      formData: { avatar: File }
      response: { url: string }
    }>()({ endpoint: "/users/:id/avatar" }),
  },

  posts: {
    list: Tapi.get<{
      query: { authorId?: string }
      response: Post[]
    }>()({ endpoint: "/posts" }),

    get: Tapi.get<{
      path: { id: string }
      response: Post
    }>()({ endpoint: "/posts/:id" }),

    create: Tapi.post<{
      body: { title: string; body: string }
      response: Post
    }>()({ endpoint: "/posts" }),
  },

  reports: {
    download: Tapi.get<{
      path: { id: string }
      response: Blob
    }>()({ endpoint: "/reports/:id/download", responseType: "blob" }),
  },

  secrets: {
    // Declaring `headers` makes those keys REQUIRED at the call site.
    // Extra per-call headers are still allowed alongside the required ones.
    get: Tapi.get<{
      headers: { "x-api-key": string }
      path: { id: string }
      response: { value: string }
    }>()({ endpoint: "/secrets/:id" }),
  },
}

// ─── Client ──────────────────────────────────────────────────────────

const api = Tapi.builder()
  .withHost("https://api.example.com")
  .withDefaultHeaders({ "X-App-Version": "1.0.0" })
  .withApiError<ApiError>(async (response) => {
    const body = await response.json()
    return { code: body.error_code, details: body.messages }
  })
  .withPrefetch(async ({ headers }) => {
    const token = localStorage.getItem("token")
    if (token) headers.set("Authorization", `Bearer ${token}`)
  })
  .withPostfetch((response) => {
    if (!response.ok && response.code === 401) {
      window.location.href = "/login"
    }
  })
  .withRoutes(routes)
  .build()

// ─── Usage ───────────────────────────────────────────────────────────

async function examples() {
  // Paginated list with query params
  const users = await api.users.list({ query: { page: 1, limit: 20, role: "admin" } })

  if (users.ok) {
    console.log(`Found ${users.data.total} admins`)
  }

  // Create a user
  const created = await api.users.create({
    body: { name: "Alice", email: "alice@example.com" },
  })

  if (!created.ok) {
    if (created.status === "api_error") {
      // Typed as ApiError
      console.log(created.data.code, created.data.details)
    }
    return
  }

  // Update — path params are required, body is typed
  await api.users.update({
    path: { id: created.data.id },
    body: { name: "Alice Updated" },
  })

  // Build a URL without making a request
  const userUrl = api.users.get.path({ id: created.data.id })
  console.log(userUrl) // => "https://api.example.com/users/abc123"

  // Download a blob
  const report = await api.reports.download({ path: { id: "monthly" } })

  if (report.ok) {
    const url = URL.createObjectURL(report.data)
    console.log("Download URL:", url)
  }

  // Per-call headers — any endpoint accepts optional ad-hoc headers,
  // merged on top of the default headers for this request only.
  await api.users.list({ headers: { "x-trace-id": crypto.randomUUID() } })

  // Required header — declared on the endpoint, enforced at the call site.
  await api.secrets.get({
    path: { id: "db-password" },
    headers: { "x-api-key": process.env.API_KEY!, "x-trace-id": "abc" },
  })

  // Update headers at runtime
  api.setHeaders({ Authorization: "Bearer refreshed-token" })
}

export { api, routes }
