import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { getConnInfo } from "@hono/node-server/conninfo";
import {
  checkPassword,
  endSession,
  loginThrottle,
  recordLoginResult,
  requireAgent,
  requireOwner,
  sessionKey,
  startSession,
  type AgentEnv,
} from "./auth.js";
import type { Config } from "./config.js";
import { findLocale, LOCALE_COOKIE, pickLocale } from "./i18n/index.js";
import { handleMcpRequest } from "./mcp.js";
import { FRAME_CSP, wrapHtmlReport } from "./render.js";
import { NotFoundError, type Store } from "./store.js";
import { SCRIPT, STYLE } from "./web/assets.js";
import { AgentsPage, ListPage, LoginPage, NotFoundPage, PageCtx, ReportPage, type Filters } from "./web/pages.js";

const PAGE_SIZE = 50;

const APP_CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const localeOf = (c: Context) => pickLocale(getCookie(c, LOCALE_COOKIE), c.req.header("accept-language"));

/** Renders a page in the visitor's language. */
function render(c: Context, node: Child, status: 200 | 401 | 404 | 429 = 200) {
  const url = new URL(c.req.url);
  return c.html(<PageCtx.Provider value={{ locale: localeOf(c), path: url.pathname + url.search }}>{node}</PageCtx.Provider>, status);
}

/**
 * Only allow redirects to paths on this site. Resolving against a dummy origin catches
 * tricks like "/\evil.com" or embedded tabs that browsers would read as another host.
 */
function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  const base = "http://local.invalid";
  try {
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export function createApp(
  store: Store,
  config: Pick<Config, "ownerPassword" | "publicUrl"> & { trustProxy?: boolean },
  sessionSecret: string,
) {
  const app = new Hono();
  const signingKey = sessionKey(sessionSecret, config.ownerPassword);
  const secureCookies = config.publicUrl.startsWith("https://");
  const publicOrigin = new URL(config.publicUrl).origin;

  app.onError((err, c) => {
    if (err instanceof NotFoundError) return render(c, <NotFoundPage />, 404);
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.text("Internal error", 500);
  });
  app.notFound((c) => render(c, <NotFoundPage />, 404));

  app.get("/healthz", (c) => c.text("ok"));

  // ---- agents: MCP ----

  const mcp = new Hono<AgentEnv>();
  mcp.use(requireAgent(store));
  mcp.post("/", (c) => handleMcpRequest(c.req.raw, store, c.get("agent"), config.publicUrl));
  // Stateless server: no standalone SSE stream and no sessions to delete.
  mcp.on(["GET", "DELETE"], "/", (c) => c.text("Method not allowed", 405, { Allow: "POST" }));
  app.route("/mcp", mcp);

  // ---- owner: web UI ----

  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Content-Security-Policy")) c.res.headers.set("Content-Security-Policy", APP_CSP);
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("Referrer-Policy", "same-origin");
    // Popups opened from HTML reports get no handle back to this tab.
    c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  });
  // Forms here are tiny; refuse large bodies before buffering them.
  app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.text("Request too large", 413) }));
  app.use(
    "*",
    csrf({ origin: (origin, c) => origin === publicOrigin || origin === new URL(c.req.url).origin }),
  );

  app.get("/assets/style.css", (c) => c.body(STYLE, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" }));
  app.get("/assets/app.js", (c) => c.body(SCRIPT, 200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" }));

  app.get("/login", (c) => render(c, <LoginPage next={safeNext(c.req.query("next"))} />));
  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const next = safeNext(form.next);
    const ip = getClientIp(c, config.trustProxy ?? false);
    const wait = loginThrottle(ip);
    if (wait > 0) {
      const t = localeOf(c).messages;
      return render(c, <LoginPage next={next} error={t.login.tooManyAttempts(Math.ceil(wait / 1000))} />, 429);
    }
    const ok = checkPassword(String(form.password ?? ""), config.ownerPassword);
    recordLoginResult(ip, ok);
    if (!ok) return render(c, <LoginPage next={next} error={localeOf(c).messages.login.wrongPassword} />, 401);
    await startSession(c, signingKey, secureCookies);
    return c.redirect(next);
  });
  // A preference, not a state change worth protecting: plain GET so the switcher works without JS.
  app.get("/lang", (c) => {
    const locale = findLocale(c.req.query("code"));
    if (locale) {
      setCookie(c, LOCALE_COOKIE, locale.code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: secureCookies });
    }
    return c.redirect(safeNext(c.req.query("next")));
  });

  app.post("/logout", (c) => {
    endSession(c);
    return c.redirect("/login");
  });

  const owner = new Hono();
  owner.use(requireOwner(signingKey));

  owner.get("/", (c) => {
    const q = c.req.query();
    // A calendar date that actually exists, e.g. not 2026-13-45.
    const date = (v?: string) =>
      v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime()) ? v : undefined;
    const nextDay = (v: string) => {
      const d = new Date(`${v}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    };
    const f: Filters = {
      q: q.q?.trim() || undefined,
      tags: (c.req.queries("tag") ?? []).filter(Boolean),
      project: q.project || undefined,
      agent: q.agent || undefined,
      from: date(q.from),
      to: date(q.to),
      sort: q.sort === "oldest" ? "oldest" : "newest",
      page: Math.min(10_000, Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1)),
    };
    const { reports, total } = store.listReports({
      query: f.q,
      tags: f.tags,
      project: f.project,
      agentId: f.agent,
      // Date filters are whole days in the server's time zone; "to" is inclusive.
      from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
      to: f.to ? nextDay(f.to) : undefined,
      sort: f.sort,
      limit: PAGE_SIZE,
      offset: (f.page - 1) * PAGE_SIZE,
    });
    return render(
      c,
      <ListPage
        reports={reports}
        total={total}
        pageSize={PAGE_SIZE}
        tags={store.listTags()}
        projects={store.listProjects()}
        agents={store.listAgents()}
        f={f}
      />,
    );
  });

  owner.get("/reports/:id", (c) => {
    const report = store.getReport(c.req.param("id"));
    const v = Number(c.req.query("v"));
    const shown = store.getVersion(report.id, Number.isInteger(v) && v > 0 ? v : report.version);
    return render(
      c,
      <ReportPage report={report} shown={shown} versions={store.listVersions(report.id)} neighbors={store.neighbors(report.id)} />,
    );
  });

  owner.get("/reports/:id/frame", (c) => {
    const id = c.req.param("id");
    const v = Number(c.req.query("v"));
    const shown = store.getVersion(id, Number.isInteger(v) && v > 0 ? v : store.getReport(id).version);
    if (shown.format !== "html") return c.text("Not an HTML report", 400);
    return c.body(wrapHtmlReport(shown.body), 200, {
      "Content-Type": "text/html; charset=utf-8",
      // The sandbox directive applies even if the frame URL is opened directly.
      "Content-Security-Policy": `${FRAME_CSP}; sandbox allow-scripts allow-popups`,
      "Cache-Control": "private, max-age=300",
    });
  });

  owner.post("/reports/:id/delete", (c) => {
    store.deleteReport(c.req.param("id"));
    return c.redirect("/");
  });

  owner.get("/agents", (c) => render(c, <AgentsPage agents={store.listAgents()} publicUrl={config.publicUrl} />));
  owner.post("/agents", async (c) => {
    const form = await c.req.parseBody();
    const name = String(form.name ?? "").trim().slice(0, 60);
    if (!name) return c.redirect("/agents");
    const created = store.createAgent(name);
    c.header("Cache-Control", "no-store");
    return render(c, <AgentsPage agents={store.listAgents()} publicUrl={config.publicUrl} created={created} />);
  });
  owner.post("/agents/:id/revoke", (c) => {
    store.revokeAgent(c.req.param("id"));
    return c.redirect("/agents");
  });

  app.route("/", owner);
  return app;
}

function getClientIp(c: Parameters<typeof getConnInfo>[0], trustProxy: boolean): string {
  if (trustProxy) {
    // The last hop is the address our own proxy saw; earlier entries are client-controlled.
    const hop = c.req.header("x-forwarded-for")?.split(",").pop()?.trim();
    if (hop) return hop;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
