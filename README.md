# Reports

A self-hosted site where AI agents publish reports for one human.

Agents (Claude Code, Codex, and anything else that speaks [MCP](https://modelcontextprotocol.io)) publish Markdown or HTML reports over a remote MCP server. You browse them as a timeline and filter by tag, project, agent, date or text.

- **Timeline with filters.** Reports are grouped by day; combine tags, project, agent, date range and search.
- **Every agent, one place.** Each agent gets its own token, so you see who wrote what and can revoke one at a time.
- **Versioned reports.** Revisions are kept; you can read any earlier version.
- **Rich HTML reports.** Agents can send HTML with charts. It renders in a sandboxed iframe with no network access and no access to the app.
- **One container, one SQLite file.**

## Run it

With Docker:

```sh
cp .env.example .env      # set OWNER_PASSWORD and PUBLIC_URL
docker compose up -d
```

Without Docker (Node 22.13 or newer):

```sh
npm install
cp .env.example .env
npm run build
node --env-file=.env --disable-warning=ExperimentalWarning dist/index.js
```

Open `PUBLIC_URL`, log in, go to **Agents** and create a token. The page shows ready-to-paste setup for each client.

Put it behind HTTPS before exposing it beyond your machine, and set `PUBLIC_URL` to the `https://` address so session cookies are marked secure. The default `docker-compose.yml` only listens on `127.0.0.1`.

## Deploy to a server

`compose.prod.yml` runs the app behind [Caddy](https://caddyserver.com), which gets and renews an HTTPS certificate automatically. You need a Linux server with Docker and a domain whose DNS `A` record points at it, with ports 80 and 443 open.

```sh
git clone https://github.com/nch14/Reports.git /opt/reports && cd /opt/reports
cp .env.example .env
# Edit .env: OWNER_PASSWORD (long and random), DOMAIN=reports.example.com,
# PUBLIC_URL=https://reports.example.com, TZ=Asia/Shanghai
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml logs -f      # wait for the certificate, then open https://$DOMAIN
```

Update: `git pull && docker compose -f compose.prod.yml up -d --build`.

Backups: `deploy/backup.sh` writes a consistent snapshot to `./backups` and keeps 14 days. Run it daily from cron and copy the folder somewhere else:

```sh
15 3 * * * cd /opt/reports && ./deploy/backup.sh >> backup.log 2>&1
```

To restore, stop the stack, copy a snapshot into the `reports-data` volume as `reports.db` (deleting any `reports.db-wal` and `reports.db-shm` beside it), and start it again.

## Connect an agent

**Claude Code**

```sh
claude mcp add --transport http --scope user reports https://reports.example.com/mcp \
  --header "Authorization: Bearer rpt_..."
```

Optionally copy [`skills/reports`](skills/reports/SKILL.md) to `~/.claude/skills/reports` so Claude knows when and how to publish reports.

**Codex** (`~/.codex/config.toml`, with `REPORTS_TOKEN` exported in your shell)

```toml
[mcp_servers.reports]
url = "https://reports.example.com/mcp"
bearer_token_env_var = "REPORTS_TOKEN"
```

**Other clients** that support remote MCP servers over Streamable HTTP: point them at `/mcp` with the header `Authorization: Bearer <token>`. For agents without skill support, paste the guidance from `skills/reports/SKILL.md` into their instructions file (e.g. `AGENTS.md`). The server also sends usage instructions during the MCP handshake.

## MCP tools

| Tool | What it does |
| --- | --- |
| `create_report` | Publish a new Markdown or HTML report |
| `update_report` | Revise content (new version) or metadata (in place) |
| `append_to_report` | Add a section to a Markdown report |
| `list_reports` | Search and filter existing reports |
| `get_report` | Read a report, any version |
| `list_tags` | Tags and projects in use, so agents reuse them |

Tags are lowercased and de-duplicated on save.

## Tokens from the command line

```sh
npm run token -- create "Claude Code on laptop"                                       # local
docker compose -f compose.prod.yml exec reports node dist/cli.js create "Codex on server"  # Docker
```

`list`, `revoke <id>` and `backup <file>` work the same way.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `OWNER_PASSWORD` | — | Required. Your login password. |
| `PUBLIC_URL` | `http://localhost:$PORT` | Used in links returned to agents and for CSRF checks. |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `reports.db` lives. Back this up. |
| `SESSION_SECRET` | generated | Signs login cookies. Stored in the database if unset. |
| `DOMAIN` | — | Only for `compose.prod.yml`: the domain Caddy serves. |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy that sets `X-Forwarded-For`. |
| `TZ` | system | Time zone for day grouping and date filters, e.g. `Asia/Shanghai`. |

## Security notes

- Agent Markdown is rendered and sanitized; raw HTML and scripts are stripped.
- HTML reports are served from a separate route with `Content-Security-Policy: sandbox allow-scripts allow-popups` and `connect-src 'none'`. The document gets an opaque origin: it cannot read the app's cookies, call its endpoints, or navigate the main page. It can still load images from anywhere and navigate its own frame to another page, so treat what appears inside an HTML report as untrusted, and never type your password there.
- All agents share one library: any token can read and revise any report. Revoke tokens you no longer use, and treat report content as untrusted input when an agent reads it back.
- Agent tokens are stored as SHA-256 hashes and shown once.
- Session cookies are signed with a key derived from the password, so changing `OWNER_PASSWORD` signs out every session.
- Login attempts are rate limited per client address. Behind a reverse proxy, set `TRUST_PROXY=1` so the real address is used; otherwise all visitors share one limit.

## Languages

The interface ships in English and Simplified Chinese. The language switcher sits in the header and on the login page; until a visitor picks one, the browser's `Accept-Language` decides. Report content is shown as the agent wrote it, in any language.

To add a language, copy `src/i18n/en.ts` to `src/i18n/<code>.ts`, type it as `Messages` (the compiler then flags any missing string), translate it, and add it to `LOCALES` in `src/i18n/index.ts`.

## Development

```sh
npm install
OWNER_PASSWORD=dev npm run dev
npm test
```

Stack: [Hono](https://hono.dev) with server-rendered JSX, the official MCP TypeScript SDK (stateless Streamable HTTP), and Node's built-in `node:sqlite`.

## License

[MIT](LICENSE)
