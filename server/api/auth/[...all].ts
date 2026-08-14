import { auth } from "#server/utils/auth";

// Mounts the Better Auth handler under /api/auth/* (sign-in, sign-up, sign-out,
// get-session, and later OAuth callbacks). better-auth owns all sub-paths.
export default defineEventHandler((event) => auth.handler(toWebRequest(event)));
