// Page guard for the /admin surfaces: superadmins only (auth middleware has
// already run — auth.global.ts redirects signed-out users). Non-admins get
// a 403-style message page.
export default defineNuxtRouteMiddleware(() => {
  const isAdmin = useState<boolean>("auth:isAdmin", () => false);
  if (!isAdmin.value) {
    return navigateTo("/admin-denied");
  }
});
