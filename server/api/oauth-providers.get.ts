/**
 * Reports which OAuth providers are enabled (i.e. have credentials configured).
 * The login/register UI uses this to show only the buttons that will actually
 * work — clicking a WeChat button with no WECHAT_APP_ID would just fail at the
 * callback. Providers are enabled purely by the presence of their env vars, so
 * this stays in sync with the conditional registration in server/utils/auth.ts.
 */
export default defineEventHandler(() => ({
  github: Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  ),
  wechat: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
}));
