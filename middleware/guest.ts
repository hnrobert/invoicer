// Keep logged-in users out of the auth pages (bounce them to the app).
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth();
  if (user.value) return navigateTo("/");
});
