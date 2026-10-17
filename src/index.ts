import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { resolveSessionSecret } from "./auth.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { Store } from "./store.js";

const config = loadConfig();
const store = new Store(openDb(path.join(config.dataDir, "reports.db")));
const app = createApp(store, config, resolveSessionSecret(store, config.sessionSecret));

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Reports listening on http://localhost:${port} (public URL ${config.publicUrl})`);
  if (store.listAgents().length === 0) {
    console.log(`No agents yet. Create a token at ${config.publicUrl}/agents or run: npm run token -- create "<name>"`);
  }
});
