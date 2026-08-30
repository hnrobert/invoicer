import type { BetterAuthPlugin } from "better-auth";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { AppDataSource } from "./database";
import { Passkey } from "#server/entities/passkey.entity";
import { sqlGet } from "./auth";
import {
  bufferToUint8,
  clearChallengeCookie,
  getChallengeCookie,
  getRelyingParty,
  parseTransports,
  setChallengeCookie,
  webauthnUserId,
} from "./webauthn";

/**
 * Passkey (WebAuthn) support as a Better Auth plugin — mounted under
 * /api/auth/passkey/*, so sessions are created through better-auth's own
 * internalAdapter + setSessionCookie (identical cookies to password login;
 * every downstream guard keeps working unchanged). Ported from the reference
 * project (verifier-gateway) and adapted to better-auth's plugin endpoint
 * model, since better-auth 1.6 has no first-party passkey plugin.
 *
 *   GET  /passkey/login-options    discoverable-login ceremony options
 *   POST /passkey/login-verify     verify + create the better-auth session
 *   GET  /passkey/register-options add-a-passkey options (session required)
 *   POST /passkey/register-verify  verify + store the credential
 *   GET  /passkey/list             the caller's passkeys (safe fields only)
 *   POST /passkey/remove           delete one of the caller's passkeys
 */

interface UserRow {
  id: string;
  name: string;
  email: string;
}

const getUser = async (userId: string): Promise<UserRow | undefined> =>
  sqlGet<UserRow>('SELECT id, name, email FROM "user" WHERE id = $1', [userId]);

export function passkeyPlugin(): BetterAuthPlugin {
  return {
    id: "passkey",
    endpoints: {
      "passkey/login-options": createAuthEndpoint(
        "/passkey/login-options",
        {
          method: "GET",
          metadata: { openapi: { description: "Passkey login options" } },
        },
        async (ctx) => {
          const { rpID } = getRelyingParty(ctx);
          const options = await generateAuthenticationOptions({
            rpID,
            // Discoverable (usernameless) ceremony: the browser offers any of
            // the visitor's passkeys for this RP; the chosen credential id
            // tells us which account to sign in.
            allowCredentials: [],
            userVerification: "preferred",
          });
          setChallengeCookie(ctx, options.challenge);
          return ctx.json(options);
        },
      ),

      "passkey/login-verify": createAuthEndpoint(
        "/passkey/login-verify",
        { method: "POST" },
        async (ctx) => {
          const { rpID, origin } = getRelyingParty(ctx);
          const body = ctx.body as AuthenticationResponseJSON;

          const fail = (status: number, message: string) => {
            clearChallengeCookie(ctx);
            throw new APIError("BAD_REQUEST", { message, statusCode: status });
          };

          const expectedChallenge = getChallengeCookie(ctx);
          if (!expectedChallenge) fail(400, "Missing or expired challenge");

          const repo = AppDataSource.getRepository(Passkey);
          const passkey = await repo.findOne({
            where: { credentialId: body?.id ?? "" },
          });
          if (!passkey) fail(401, "Unknown credential");

          try {
            const verification = await verifyAuthenticationResponse({
              response: body,
              expectedChallenge: expectedChallenge!,
              expectedOrigin: origin,
              expectedRPID: rpID,
              credential: {
                id: passkey!.credentialId,
                publicKey: bufferToUint8(passkey!.publicKey),
                counter: passkey!.counter,
                transports: parseTransports(passkey!.transports),
              },
              requireUserVerification: false,
            });
            if (!verification.verified) {
              throw new Error("Authentication could not be verified");
            }

            // Clone-detection counter — persist the new value.
            await repo.update(passkey!.id, {
              counter: verification.authenticationInfo.newCounter,
            });

            const user = await getUser(passkey!.userId);
            if (!user) fail(404, "User not found");

            // Same session + cookie path as password login.
            const session = await ctx.context.internalAdapter.createSession(
              user!.id,
            );
            const fullUser = (await sqlGet(
              'SELECT id, name, email, "emailVerified", image, "createdAt", "updatedAt" FROM "user" WHERE id = $1',
              [user!.id],
            )) as Record<string, unknown>;
            await setSessionCookie(ctx, {
              session,
              user: {
                ...fullUser,
                createdAt: new Date(fullUser.createdAt as string),
                updatedAt: new Date(fullUser.updatedAt as string),
              } as never,
            });
            return ctx.json({
              user: { id: user!.id, name: user!.name, email: user!.email },
            });
          } catch (error) {
            if (error && typeof error === "object" && "statusCode" in error)
              throw error;
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("BAD_REQUEST", { message, statusCode: 400 });
          } finally {
            clearChallengeCookie(ctx);
          }
        },
      ),

      "passkey/register-options": createAuthEndpoint(
        "/passkey/register-options",
        { method: "GET" },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Unauthorized",
              statusCode: 401,
            });
          }
          const { rpID, rpName } = getRelyingParty(ctx);
          const user = await getUser(session.user.id);
          if (!user) {
            throw new APIError("NOT_FOUND", {
              message: "User not found",
              statusCode: 404,
            });
          }

          // Exclude existing credentials so the same authenticator can't be
          // registered twice.
          const existing = await AppDataSource.getRepository(Passkey).find({
            where: { userId: user.id },
          });
          const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: user.name || user.email,
            userID: webauthnUserId(user.id),
            attestationType: "none",
            excludeCredentials: existing.map((p) => ({
              id: p.credentialId,
              transports: parseTransports(p.transports),
            })),
            authenticatorSelection: {
              residentKey: "required", // discoverable → usernameless login
              userVerification: "preferred",
            },
            // Exclude -8 (Ed25519): avoids known OKP verify errors on some
            // Node/browser combos (per the reference project).
            supportedAlgorithmIDs: [-7, -257],
          });

          setChallengeCookie(ctx, options.challenge);
          return ctx.json(options);
        },
      ),

      "passkey/register-verify": createAuthEndpoint(
        "/passkey/register-verify",
        { method: "POST" },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Unauthorized",
              statusCode: 401,
            });
          }
          const { rpID, origin } = getRelyingParty(ctx);
          const body = ctx.body as RegistrationResponseJSON;

          const expectedChallenge = getChallengeCookie(ctx);
          if (!expectedChallenge) {
            clearChallengeCookie(ctx);
            throw new APIError("BAD_REQUEST", {
              message: "Missing or expired challenge",
              statusCode: 400,
            });
          }

          try {
            const verification = await verifyRegistrationResponse({
              response: body,
              expectedChallenge,
              expectedOrigin: origin,
              expectedRPID: rpID,
              requireUserVerification: false,
            });
            if (!verification.verified || !verification.registrationInfo) {
              throw new Error("Registration could not be verified");
            }

            const { credential, credentialDeviceType, credentialBackedUp } =
              verification.registrationInfo;

            const repo = AppDataSource.getRepository(Passkey);
            const existing = await repo.findOne({
              where: { credentialId: credential.id },
            });
            if (existing) {
              throw new APIError("CONFLICT", {
                message:
                  existing.userId === session.user.id
                    ? "Credential already registered"
                    : "Credential already registered to another account",
                statusCode: 409,
              });
            }

            const saved = await repo.save({
              userId: session.user.id,
              credentialId: credential.id,
              publicKey: Buffer.from(credential.publicKey),
              counter: credential.counter,
              transports: credential.transports
                ? JSON.stringify(credential.transports)
                : null,
              deviceType: credentialDeviceType,
              backedUp: credentialBackedUp,
            });
            return ctx.json({
              verified: true,
              passkey: {
                id: saved.id,
                deviceType: saved.deviceType,
                backedUp: saved.backedUp,
                createdAt: saved.createdAt.toISOString(),
              },
            });
          } catch (error) {
            if (error && typeof error === "object" && "statusCode" in error)
              throw error;
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("BAD_REQUEST", { message, statusCode: 400 });
          } finally {
            clearChallengeCookie(ctx);
          }
        },
      ),

      "passkey/list": createAuthEndpoint(
        "/passkey/list",
        { method: "GET" },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Unauthorized",
              statusCode: 401,
            });
          }
          const rows = await AppDataSource.getRepository(Passkey).find({
            where: { userId: session.user.id },
            order: { id: "ASC" },
          });
          return ctx.json({
            passkeys: rows.map((p) => ({
              id: p.id,
              deviceType: p.deviceType,
              backedUp: p.backedUp,
              createdAt: p.createdAt.toISOString(),
            })),
          });
        },
      ),

      "passkey/remove": createAuthEndpoint(
        "/passkey/remove",
        { method: "POST" },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Unauthorized",
              statusCode: 401,
            });
          }
          const id = Number((ctx.body as { id?: number })?.id);
          if (!Number.isFinite(id)) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid id",
              statusCode: 400,
            });
          }
          const repo = AppDataSource.getRepository(Passkey);
          const passkey = await repo.findOne({ where: { id } });
          // 404 (not 403) for others' passkeys so ownership can't be probed.
          if (!passkey || passkey.userId !== session.user.id) {
            throw new APIError("NOT_FOUND", {
              message: "Passkey not found",
              statusCode: 404,
            });
          }
          await repo.delete({ id });
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
