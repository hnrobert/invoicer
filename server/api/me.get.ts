import { auth } from "#server/utils/auth";

// Returns the currently authenticated user (or null) by reading the session
// cookie. Called by the client during SSR + after sign-in/sign-up to hydrate
// the shared `auth:user` state.
export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({
    headers: toWebRequest(event).headers,
  });
  return { user: session?.user ?? null };
});
