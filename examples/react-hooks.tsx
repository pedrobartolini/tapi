import { useState } from "react"
import { api } from "./tapi-example"

// ─── Auto-fetching ───────────────────────────────────────────────────

function UserList() {
  const [page, setPage] = useState(1)
  const [users, error, loading] = api.users.list.useHook({
    query: { page, limit: 10 },
  })

  if (loading) return <p>Loading...</p>
  if (error) return <p>{error.message}</p>

  return (
    <div>
      <ul>
        {users.items.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
      <p>
        Page {users.page} of {Math.ceil(users.total / 10)}
      </p>
      <button onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  )
}

// ─── Conditional fetching ────────────────────────────────────────────

function UserProfile({ userId }: { userId: string | null }) {
  // Pass null to skip — no request until userId exists
  const [user, error, loading, refresh] = api.users.get.useHook(
    userId ? { path: { id: userId } } : null,
  )

  if (!userId) return <p>Select a user</p>
  if (loading) return <p>Loading...</p>
  if (error) return <p>{error.message}</p>

  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      <button onClick={() => refresh()}>Refresh</button>
    </div>
  )
}

// ─── Lazy mode (mutations) ───────────────────────────────────────────

function CreateUserForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  const [created, error, loading, submit] = api.users.create.useHook({
    body: { name, email },
    lazy: true,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const success = await submit()
    if (success) alert(`Created user: ${created?.name}`)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create"}
      </button>
      {error && <p>{error.message}</p>}
    </form>
  )
}

// ─── Optimistic updates ─────────────────────────────────────────────

function UserListWithDelete() {
  const [users, error, loading, refresh, setUsers] = api.users.list.useHook({
    query: { limit: 50 },
  })

  async function handleDelete(id: string) {
    // Optimistically remove from the list
    setUsers((prev) => ({
      ...prev,
      items: prev.items.filter((u) => u.id !== id),
      total: prev.total - 1,
    }))

    const result = await api.users.delete({ path: { id } })

    // Rollback on failure
    if (!result.ok) refresh()
  }

  if (loading) return <p>Loading...</p>
  if (error) return <p>{error.message}</p>

  return (
    <ul>
      {users.items.map((user) => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => handleDelete(user.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}

export { UserList, UserProfile, CreateUserForm, UserListWithDelete }
