// Regressions for issues found in the pre-release security review.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { renderMarkdown } from "../src/render.js";
import { Store } from "../src/store.js";

let store: Store;
const servers: ServerType[] = [];

async function start(password: string, trustProxy = false) {
  const app = createApp(store, { ownerPassword: password, publicUrl: "http://placeholder", trustProxy }, "secret");
  const server = serve({ fetch: app.fetch, port: 0 });
  servers.push(server);
  await new Promise((r) => server.once("listening", r));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

const form = (base: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
  });

async function login(base: string, password: string) {
  const res = await form(base, { password, next: "/" });
  assert.equal(res.status, 302);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

before(() => {
  store = new Store(openDb(":memory:"));
});
after(() => servers.forEach((s) => s.close()));

test("redirect targets stay on this site", async () => {
  const base = await start("pw-redirects");
  for (const next of ["/\\evil.com", "/%09/evil.com", "//evil.com", "https://evil.com", "/\t/evil.com"]) {
    const res = await fetch(`${base}/lang?code=en&next=${encodeURIComponent(next)}`, { redirect: "manual" });
    const location = res.headers.get("location")!;
    assert.ok(location.startsWith("/") && !location.startsWith("//") && !location.includes("\\"), `${next} -> ${location}`);
    assert.equal(new URL(location, "http://local.invalid").host, "local.invalid", `${next} -> ${location}`);
  }
  const ok = await fetch(`${base}/lang?code=en&next=${encodeURIComponent("/reports/abc?v=2")}`, { redirect: "manual" });
  assert.equal(ok.headers.get("location"), "/reports/abc?v=2");
});

test("one client's failed logins do not lock out others behind a trusted proxy", async () => {
  const base = await start("pw-throttle", true);
  for (let i = 0; i < 8; i++) await form(base, { password: "wrong" }, { "X-Forwarded-For": "203.0.113.9" });
  const blocked = await form(base, { password: "pw-throttle" }, { "X-Forwarded-For": "203.0.113.9" });
  assert.equal(blocked.status, 429);
  // The spoofable left part of the header is ignored; only the proxy's hop counts.
  const owner = await form(base, { password: "pw-throttle" }, { "X-Forwarded-For": "203.0.113.9, 198.51.100.7" });
  assert.equal(owner.status, 302);
});

test("changing the password signs out existing sessions", async () => {
  const oldBase = await start("pw-before");
  const cookie = await login(oldBase, "pw-before");
  assert.equal((await fetch(`${oldBase}/`, { headers: { Cookie: cookie }, redirect: "manual" })).status, 200);
  const newBase = await start("pw-after");
  assert.equal((await fetch(`${newBase}/`, { headers: { Cookie: cookie }, redirect: "manual" })).status, 302);
});

test("large form bodies are refused", async () => {
  const base = await start("pw-body");
  const res = await form(base, { password: "x".repeat(200_000) });
  assert.equal(res.status, 413);
});

test("bad filter values do not error", async () => {
  const base = await start("pw-filters");
  const cookie = await login(base, "pw-filters");
  for (const qs of ["from=2026-13-45", "to=2026-02-31x", "page=1e21", "page=-3"]) {
    const res = await fetch(`${base}/?${qs}`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, qs);
  }
});

test("search treats % and _ literally", () => {
  const agent = store.createAgent("search").agent;
  store.createReport(agent.id, { title: "Coverage at 100% now", body: "x", format: "markdown" });
  store.createReport(agent.id, { title: "Plain title", body: "y", format: "markdown" });
  assert.equal(store.listReports({ query: "100%" }).total, 1);
  assert.equal(store.listReports({ query: "%" }).total, 1);
  assert.equal(store.listReports({ query: "_" }).total, 0);
});

test("rendered links keep rel=noopener", () => {
  assert.match(renderMarkdown("[x](https://example.com)"), /rel="noopener noreferrer nofollow"/);
});

test("HTML report frames cannot escape the sandbox through popups", async () => {
  const base = await start("pw-frame");
  const cookie = await login(base, "pw-frame");
  const agent = store.createAgent("frame").agent;
  const r = store.createReport(agent.id, { title: "F", body: "<p>x</p>", format: "html" });
  const frame = await fetch(`${base}/reports/${r.id}/frame`, { headers: { Cookie: cookie } });
  assert.doesNotMatch(frame.headers.get("content-security-policy")!, /escape-sandbox/);
  const page = await fetch(`${base}/reports/${r.id}`, { headers: { Cookie: cookie } });
  assert.equal(page.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.doesNotMatch(await page.text(), /escape-sandbox/);
});
