// Manage agent tokens without the web UI, e.g. inside the Docker container:
//   node dist/cli.js create "Claude Code on laptop"
//   node dist/cli.js list
//   node dist/cli.js revoke <id>
//   node dist/cli.js backup /data/backups/reports-2026-10-17.db
import fs from "node:fs";
import path from "node:path";
import { openDb } from "./db.js";
import { Store } from "./store.js";

const store = new Store(openDb(path.join(path.resolve(process.env.DATA_DIR ?? "./data"), "reports.db")));
const [command, arg] = process.argv.slice(2);

switch (command) {
  case "create": {
    if (!arg) throw new Error('Usage: create "<agent name>"');
    const { agent, token } = store.createAgent(arg);
    console.log(`Created agent ${agent.name} (${agent.id}). Token, shown once:\n\n  ${token}\n`);
    break;
  }
  case "list":
    for (const a of store.listAgents()) {
      console.log(`${a.id}  ${a.name}${a.revoked_at ? "  (revoked)" : ""}  last used: ${a.last_used_at ?? "never"}`);
    }
    break;
  case "revoke":
    if (!arg) throw new Error("Usage: revoke <agent id>");
    store.revokeAgent(arg);
    console.log(`Revoked ${arg}.`);
    break;
  case "backup": {
    if (!arg) throw new Error("Usage: backup <file>");
    const file = path.resolve(arg);
    if (fs.existsSync(file)) throw new Error(`${file} already exists`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A consistent snapshot, safe to take while the server is running.
    store.db.prepare("VACUUM INTO ?").run(file);
    console.log(`Backed up to ${file}.`);
    break;
  }
  default:
    console.log("Commands: create <name> | list | revoke <id> | backup <file>");
    process.exitCode = command ? 1 : 0;
}
