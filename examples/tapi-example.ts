/**
 * Tapi Example - Type-safe API client with pure TypeScript types
 *
 * This example demonstrates the new Tapi API that uses TypeScript generics
 * instead of Zod schemas for type safety.
 */

import Tapi from "../src";

// Define your types directly - no Zod needed!
type User = {
  id: number;
  name: string;
  email: string;
  username: string;
  phone?: string;
  website?: string;
  address?: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: { lat: string; lng: string };
  };
  company?: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
};

type Post = {
  id: number;
  userId: number;
  title: string;
  body: string;
};

type Comment = {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
};

type CreatePostInput = {
  userId: number;
  title: string;
  body: string;
};

// Custom error type for API errors
type ApiError = {
  code: number;
  message: string;
  details?: unknown;
};

// Build the API client using Tapi
const api = Tapi.builder()
  .withHost("https://jsonplaceholder.typicode.com")
  .withApiError(async (response): Promise<ApiError> => {
    try {
      const data = await response.json();
      return {
        code: response.status,
        message: data.message || response.statusText,
        details: data
      };
    } catch {
      return {
        code: response.status,
        message: response.statusText
      };
    }
  })
  .withDefaultHeaders({
    "Content-Type": "application/json"
  })
  .withPrefetch((request) => {
    console.log(`[${request.method}] ${request.url}`);
  })
  .withPostfetch((response) => {
    if (response.ok) {
      console.log(`✅ Success: ${response.endpoint}`);
    } else {
      console.error(`❌ Error [${response.status}]: ${response.endpoint}`);
    }
  })
  .withRoutes({
    users: {
      // GET /users - list all users (no params needed)
      getAll: Tapi.get<{ response: User[] }>()({
        endpoint: "/users"
      }),

      // GET /users/:id - get user by id
      getById: Tapi.get<{ path: { id: number }; response: User }>()({
        endpoint: "/users/:id"
      })
    },

    posts: {
      // GET /posts - list all posts with optional query filter
      getAll: Tapi.get<{ query: { userId?: number }; response: Post[] }>()({
        endpoint: "/posts"
      }),

      // GET /posts/:id - get post by id
      getById: Tapi.get<{ path: { id: number }; response: Post }>()({
        endpoint: "/posts/:id"
      }),

      // POST /posts - create a new post
      create: Tapi.post<{ body: CreatePostInput; response: Post }>()({
        endpoint: "/posts"
      }),

      // GET /posts/:postId/comments - get comments for a post
      comments: Tapi.get<{ path: { postId: number }; response: Comment[] }>()({
        endpoint: "/posts/:postId/comments"
      })
    }
  })
  .build();

// Example usage
async function main() {
  console.log("=== Tapi Example ===\n");

  // Get all users
  console.log("Fetching all users...");
  const usersResult = await api.users.getAll({});
  if (usersResult.ok) {
    console.log(`Found ${usersResult.data.length} users`);
    console.log("First user:", usersResult.data[0].name);
  }

  console.log("\n---\n");

  // Get user by ID
  console.log("Fetching user #1...");
  const userResult = await api.users.getById({ path: { id: 1 } });
  if (userResult.ok) {
    console.log("User:", userResult.data.name);
    console.log("Email:", userResult.data.email);
  }

  console.log("\n---\n");

  // Get posts for a user
  console.log("Fetching posts for user #1...");
  const postsResult = await api.posts.getAll({ query: { userId: 1 } });
  if (postsResult.ok) {
    console.log(`Found ${postsResult.data.length} posts`);
  }

  console.log("\n---\n");

  // Create a new post
  console.log("Creating a new post...");
  const createResult = await api.posts.create({
    body: {
      userId: 1,
      title: "Hello Tapi!",
      body: "This is a test post created with Tapi."
    }
  });
  if (createResult.ok) {
    console.log("Created post with ID:", createResult.data.id);
  }

  console.log("\n---\n");

  // Get comments for a post
  console.log("Fetching comments for post #1...");
  const commentsResult = await api.posts.comments({ path: { postId: 1 } });
  if (commentsResult.ok) {
    console.log(`Found ${commentsResult.data.length} comments`);
    console.log("First comment by:", commentsResult.data[0].email);
  }

  console.log("\n=== Example Complete ===");
}

main().catch(console.error);

// Export for type checking
export { api };
