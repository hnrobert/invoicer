import { auth } from "#server/utils/auth";
import { isSuperAdmin } from "#server/utils/superadmin";

// Returns the currently authenticated user (or null) by reading the session
// cookie. Called by the client during SSR + after sign-in/sign-up to hydrate
// the shared `auth:user` state. `isAdmin` gates the /admin surfaces.
export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({
    headers: toWebRequest(event).headers,
  });
  return {
    user: session?.user ?? null,
    isAdmin: session?.user ? await isSuperAdmin(session.user.id) : false,
  };
});
