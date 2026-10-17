import assert from "node:assert/strict";
import { test } from "node:test";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { pickLocale } from "../src/i18n/index.js";
import { Store } from "../src/store.js";

test("pickLocale prefers the saved choice, then Accept-Language", () => {
  assert.equal(pickLocale(undefined, undefined).code, "en");
  assert.equal(pickLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8").code, "zh-CN");
  assert.equal(pickLocale(undefined, "zh-TW").code, "zh-CN", "falls back on the primary language");
  assert.equal(pickLocale(undefined, "fr-FR,en;q=0.5").code, "en");
  assert.equal(pickLocale(undefined, "en;q=0.3,zh;q=0.8").code, "zh-CN", "respects q weights");
  assert.equal(pickLocale("en", "zh-CN").code, "en");
  assert.equal(pickLocale("xx", "zh-CN").code, "zh-CN", "ignores unknown saved values");
});

test("pages render in the chosen language", async () => {
  const store = new Store(openDb(":memory:"));
  const app = createApp(store, { ownerPassword: "pw", publicUrl: "http://placeholder" }, "secret");
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  try {
    const en = await fetch(`${base}/login`).then((r) => r.text());
    assert.match(en, /<html lang="en">/);
    assert.match(en, /Log in/);

    const zh = await fetch(`${base}/login`, { headers: { "Accept-Language": "zh-CN" } }).then((r) => r.text());
    assert.match(zh, /<html lang="zh-CN">/);
    assert.match(zh, /登录/);

    const sw = await fetch(`${base}/lang?code=zh-CN&next=%2Flogin`, { redirect: "manual" });
    assert.equal(sw.status, 302);
    assert.equal(sw.headers.get("location"), "/login");
    const langCookie = sw.headers.get("set-cookie")!.split(";")[0]!;
    assert.equal(langCookie, "lang=zh-CN");

    const login = await fetch(`${base}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", Cookie: langCookie },
      body: new URLSearchParams({ password: "nope" }),
    }).then((r) => r.text());
    assert.match(login, /密码错误/);

    const offsite = await fetch(`${base}/lang?code=en&next=https://evil.example`, { redirect: "manual" });
    assert.equal(offsite.headers.get("location"), "/");
  } finally {
    server.close();
  }
});
