import { auth } from "#server/utils/auth";
import { findEmailOwner, primaryForLogin } from "#server/utils/emails";

// Mounts the Better Auth handler under /api/auth/* (sign-in, sign-up, sign-out,
// get-session, OAuth callbacks). better-auth owns all sub-paths — except the
// two credential endpoints we intercept for the multi-email model:
//   - sign-up/email: the "已注册提醒" step — if the email is already linked to
//     ANY account (primary or secondary), reject with guidance instead of a raw
//     duplicate error (mirrors the OAuth account_not_linked flow).
//   - sign-in/email: signing in with a linked SECONDARY email maps to the
//     account's primary before better-auth sees it.
// Intercepted requests have their body re-serialized into a fresh Request —
// reading the body here drains the original stream, so toWebRequest(event)
// must NOT be used afterwards on these paths.
export default defineEventHandler(async (event) => {
  const path = event.path.replace(/^.*\/api\/auth/, "");
  const isSignUp = event.method === "POST" && path === "/sign-up/email";
  const isSignIn = event.method === "POST" && path === "/sign-in/email";

  if (!isSignUp && !isSignIn) {
    return auth.handler(toWebRequest(event));
  }

  const raw = (await readBody<Record<string, unknown>>(event).catch(
    () => ({}),
  )) as Record<string, unknown> & { email?: unknown };
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

  if (isSignUp) {
    // Username policy: letters (both cases), digits, hyphen, underscore only.
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,39}$/.test(name)) {
      throw createError({
        statusCode: 400,
        message: "用户名仅可包含大小写字母、数字、- 和 _（1-39 个字符）。",
      });
    }
  }

  if (isSignUp && email) {
    const owner = await findEmailOwner(email);
    if (owner) {
      // 提醒注册环节: guide to the existing account instead of a raw
      // duplicate error. `message` (not statusMessage) — h3 sanitizes long
      // statusMessages, and the client's messageFromError reads it.
      throw createError({
        statusCode: 409,
        message:
          "该邮箱已被账号绑定。请直接使用该账号登录；若忘记密码可重置；如需新账号请更换邮箱。",
      });
    }
  }
  if (isSignIn && email) {
    const primary = await primaryForLogin(email);
    if (primary) raw.email = primary;
  }

  const headers = new Headers(getHeaders(event) as Record<string, string>);
  const req = new Request(toWebRequest(event).url, {
    method: "POST",
    headers,
    body: JSON.stringify(raw),
  });
  return auth.handler(req);
});
