import crypto from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Agent, Store } from "./store.js";

const SESSION_COOKIE = "reports_session";
const SESSION_DAYS = 30;

export function resolveSessionSecret(store: Store, configured?: string): string {
  if (configured) return configured;
  let secret = store.getSetting("session_secret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("base64url");
    store.setSetting("session_secret", secret);
  }
  return secret;
}

/**
 * The key that signs session cookies. Mixing in the password means changing it
 * invalidates every existing session, including stolen cookies.
 */
export const sessionKey = (secret: string, password: string) =>
  crypto.createHmac("sha256", secret).update(password).digest("base64url");

export function checkPassword(given: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Slows down password guessing: after 5 failures from one address, each attempt waits.
const failures = new Map<string, { count: number; until: number }>();

export function loginThrottle(ip: string): number {
  const entry = failures.get(ip);
  return entry && entry.until > Date.now() ? entry.until - Date.now() : 0;
}

export function recordLoginResult(ip: string, ok: boolean) {
  if (ok) {
    failures.delete(ip);
    return;
  }
  if (failures.size > 10_000) {
    for (const [key, entry] of failures) if (entry.until < Date.now() - 3_600_000) failures.delete(key);
  }
  const count = (failures.get(ip)?.count ?? 0) + 1;
  const delay = count < 5 ? 0 : Math.min(2 ** (count - 5) * 1000, 15 * 60_000);
  failures.set(ip, { count, until: Date.now() + delay });
}

export async function startSession(c: Context, secret: string, secure: boolean) {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  await setSignedCookie(c, SESSION_COOKIE, String(expires), secret, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function endSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function hasSession(c: Context, secret: string): Promise<boolean> {
  const value = await getSignedCookie(c, secret, SESSION_COOKIE);
  return typeof value === "string" && Number(value) > Date.now();
}

export function requireOwner(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (await hasSession(c, secret)) return next();
    const back = encodeURIComponent(c.req.path + (new URL(c.req.url).search || ""));
    return c.redirect(`/login?next=${back}`);
  };
}

export type AgentEnv = { Variables: { agent: Agent } };

export function requireAgent(store: Store): MiddlewareHandler<AgentEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const agent = token ? store.authenticateAgent(token) : undefined;
    if (!agent) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid agent token" }, id: null },
        401,
        { "WWW-Authenticate": 'Bearer realm="reports"' },
      );
    }
    c.set("agent", agent);
    return next();
  };
}
