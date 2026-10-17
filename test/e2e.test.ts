import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { Store } from "../src/store.js";

const PASSWORD = "test-password";
let server: ServerType;
let base: string;
let store: Store;
let token: string;
let cookie: string;

function call(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args }).then((res) => {
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    return { isError: Boolean(res.isError), text, data: res.isError ? undefined : JSON.parse(text) };
  });
}

async function connect(bearer: string) {
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

async function login(): Promise<string> {
  const res = await fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: PASSWORD, next: "/" }),
  });
  assert.equal(res.status, 302);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

const page = (path: string) => fetch(`${base}${path}`, { headers: { Cookie: cookie } }).then((r) => r.text());

before(async () => {
  store = new Store(openDb(":memory:"));
  token = store.createAgent("Test agent").token;
  const app = createApp(store, { ownerPassword: PASSWORD, publicUrl: "http://placeholder" }, "secret");
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, () => resolve());
  });
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  cookie = await login();
});

after(() => server.close());

describe("MCP", () => {
  test("rejects missing or bad tokens", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    assert.equal(res.status, 401);
    await assert.rejects(connect("rpt_wrong"));
  });

  test("create, revise, list and read reports", async () => {
    const client = await connect(token);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["append_to_report", "create_report", "get_report", "list_reports", "list_tags", "update_report"],
    );
    assert.match(client.getInstructions() ?? "", /timeline/);

    const created = await call(client, "create_report", {
      title: "Flaky test investigation",
      body: "# Findings\n\nThe test races the cache.\n\n<script>alert(1)</script>",
      summary: "Root cause found.",
      project: "api",
      tags: ["CI", " bug ", "ci"],
    });
    assert.equal(created.isError, false);
    const id = created.data.id;
    assert.equal(created.data.version, 1);
    assert.deepEqual(created.data.tags, ["ci", "bug"], "tags are normalized");
    assert.equal(created.data.url, `http://placeholder/reports/${id}`);

    const appended = await call(client, "append_to_report", { id, markdown: "## Update\n\nFixed in #12.", note: "fix landed" });
    assert.equal(appended.data.version, 2);
    const retagged = await call(client, "update_report", { id, tags: ["ci", "flaky"] });
    assert.equal(retagged.data.version, 2, "metadata changes do not create versions");

    await call(client, "create_report", { title: "Unrelated research", body: "Notes", tags: ["research"] });

    assert.equal((await call(client, "list_reports", { query: "races" })).data.total, 1);
    assert.equal((await call(client, "list_reports", { tags: ["ci", "flaky"] })).data.total, 1);
    assert.equal((await call(client, "list_reports", { tags: ["ci", "research"] })).data.total, 0);
    assert.equal((await call(client, "list_reports", { since: "2000-01-01" })).data.total, 2);

    const tags = await call(client, "list_tags", {});
    assert.deepEqual(tags.data.tags.map((t: { tag: string }) => t.tag).sort(), ["ci", "flaky", "research"]);
    assert.deepEqual(tags.data.projects, [{ project: "api", count: 1 }]);

    const got = await call(client, "get_report", { id, version: 1 });
    assert.equal(got.data.shown_version, 1);
    assert.doesNotMatch(got.data.body, /Fixed in #12/);
    assert.equal(got.data.versions.length, 2);

    assert.equal((await call(client, "get_report", { id: "nope" })).isError, true);
    await client.close();
  });

  test("HTML reports are served sandboxed", async () => {
    const client = await connect(token);
    const created = await call(client, "create_report", {
      title: "Chart",
      format: "html",
      body: "<h1>Chart</h1><script>document.body.append('ran')</script>",
    });
    const id = created.data.id;
    assert.equal((await call(client, "append_to_report", { id, markdown: "x" })).isError, true);

    assert.match(await page(`/reports/${id}`), /<iframe class="report-frame" src="\/reports\/[a-z0-9]+\/frame\?v=1" sandbox="allow-scripts/);
    const frame = await fetch(`${base}/reports/${id}/frame?v=1`, { headers: { Cookie: cookie } });
    const csp = frame.headers.get("content-security-policy")!;
    assert.match(csp, /sandbox allow-scripts/);
    assert.match(csp, /connect-src 'none'/);
    const html = await frame.text();
    assert.match(html, /document\.body\.append/);
    assert.match(html, /report-frame-height/);
    await client.close();
  });
});

describe("web", () => {
  test("requires login", async () => {
    const res = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login?next=%2F");
    const frame = await fetch(`${base}/reports/x/frame`, { redirect: "manual" });
    assert.equal(frame.status, 302);
  });

  test("lists reports with filters", async () => {
    const all = await page("/");
    assert.match(all, /Flaky test investigation/);
    assert.match(all, /Unrelated research/);
    assert.match(all, /Today/);

    const byTag = await page("/?tag=flaky");
    assert.match(byTag, /Flaky test investigation/);
    assert.doesNotMatch(byTag, /Unrelated research/);

    const byProject = await page("/?project=api");
    assert.doesNotMatch(byProject, /Unrelated research/);

    const future = await page("/?from=2999-01-01");
    assert.match(future, /Nothing matches these filters/);

    const today = new Date().toLocaleDateString("sv-SE");
    assert.match(await page(`/?from=${today}&to=${today}`), /Unrelated research/);
  });

  test("detail page renders sanitized markdown and links neighbors", async () => {
    const { reports } = store.listReports({ query: "races" });
    const html = await page(`/reports/${reports[0]!.id}`);
    assert.match(html, /The test races the cache/);
    assert.match(html, /Fixed in #12/);
    assert.doesNotMatch(html, /<script>alert/, "agent markdown is sanitized");
    assert.match(html, /Newer/);
    assert.match(await page(`/reports/${reports[0]!.id}?v=1`), /Viewing v1/);
  });

  test("rejects wrong password and cross-site posts", async () => {
    const bad = await fetch(`${base}/login`, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "nope" }),
    });
    assert.equal(bad.status, 401);
    const csrf = await fetch(`${base}/agents`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "x" }),
    });
    assert.equal(csrf.status, 403);
  });

  test("creates agent tokens that work over MCP", async () => {
    const res = await fetch(`${base}/agents`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Codex" }),
    });
    const html = await res.text();
    const newToken = html.match(/rpt_[A-Za-z0-9_-]+/)![0];
    assert.match(html, /claude mcp add --transport http/);
    const client = await connect(newToken);
    await client.close();
  });
});
