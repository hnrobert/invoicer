// Global route guard. /login and /register are handled by the `guest` middleware;
// everything else (the audit workflow at /, /settings, …) requires a session.
// The auth plugin hydrates `auth:user` before middleware runs on first load.
const PUBLIC = ["/login", "/register"];

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC.includes(to.path)) return;
  const { user } = useAuth();
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
  }
});
