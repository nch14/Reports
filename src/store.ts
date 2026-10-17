import crypto from "node:crypto";
import type { DB } from "./db.js";

export const FORMATS = ["markdown", "html"] as const;
export type Format = (typeof FORMATS)[number];

export interface Agent {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Report {
  id: string;
  title: string;
  summary: string;
  project: string;
  tags: string[];
  format: Format;
  body: string;
  version: number;
  agent_id: string;
  agent_name: string;
  created_at: string;
  updated_at: string;
}

export interface ReportVersion {
  report_id: string;
  version: number;
  title: string;
  format: Format;
  body: string;
  note: string;
  agent_name: string;
  created_at: string;
}

export class NotFoundError extends Error {}

const now = () => new Date().toISOString();

// Short, URL-safe ids without ambiguous characters.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export function newId(len = 10): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const REPORT_SELECT = `SELECT r.*, a.name AS agent_name FROM reports r JOIN agents a ON a.id = r.agent_id`;

type Row = Record<string, unknown>;

const toReport = (row: Row): Report => ({ ...(row as unknown as Report), tags: JSON.parse(row.tags as string) });

/** Lowercase, trim, and de-duplicate tags so filtering is predictable. */
export const normalizeTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

export interface CreateReportInput {
  title: string;
  body: string;
  format: Format;
  summary?: string;
  project?: string;
  tags?: string[];
}

export interface UpdateReportInput {
  title?: string;
  body?: string;
  format?: Format;
  summary?: string;
  project?: string;
  tags?: string[];
  note?: string;
}

export interface ListReportsInput {
  query?: string;
  project?: string;
  /** Reports must carry every one of these tags. */
  tags?: string[];
  agentId?: string;
  /** ISO timestamps, inclusive start and exclusive end, on created_at. */
  from?: string;
  to?: string;
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}

export class Store {
  constructor(readonly db: DB) {}

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  // ---- settings ----

  getSetting(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
    return row?.value as string | undefined;
  }

  setSetting(key: string, value: string) {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  // ---- agents ----

  /** Returns the new agent and its plaintext token, which is never stored. */
  createAgent(name: string): { agent: Agent; token: string } {
    const id = newId();
    const token = `rpt_${crypto.randomBytes(24).toString("base64url")}`;
    const created_at = now();
    this.db
      .prepare("INSERT INTO agents (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(id, name, hashToken(token), created_at);
    return { agent: { id, name, created_at, last_used_at: null, revoked_at: null }, token };
  }

  listAgents(): Agent[] {
    return this.db
      .prepare("SELECT id, name, created_at, last_used_at, revoked_at FROM agents ORDER BY created_at DESC")
      .all() as unknown as Agent[];
  }

  authenticateAgent(token: string): Agent | undefined {
    const agent = this.db
      .prepare("SELECT id, name, created_at, last_used_at, revoked_at FROM agents WHERE token_hash = ? AND revoked_at IS NULL")
      .get(hashToken(token)) as unknown as Agent | undefined;
    if (agent) this.db.prepare("UPDATE agents SET last_used_at = ? WHERE id = ?").run(now(), agent.id);
    return agent;
  }

  revokeAgent(id: string) {
    this.db.prepare("UPDATE agents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), id);
  }

  // ---- reports ----

  createReport(agentId: string, input: CreateReportInput): Report {
    const id = newId();
    const ts = now();
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO reports (id, title, summary, project, tags, format, body, version, agent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          input.title,
          input.summary ?? "",
          input.project ?? "",
          JSON.stringify(normalizeTags(input.tags ?? [])),
          input.format,
          input.body,
          agentId,
          ts,
          ts,
        );
      this.db
        .prepare(
          `INSERT INTO report_versions (report_id, version, title, format, body, note, agent_id, created_at)
           VALUES (?, 1, ?, ?, ?, '', ?, ?)`,
        )
        .run(id, input.title, input.format, input.body, agentId, ts);
    });
    return this.getReport(id);
  }

  /** Content changes (title, body, format) create a new version; metadata changes do not. */
  updateReport(agentId: string, id: string, input: UpdateReportInput): Report {
    return this.tx(() => {
      const current = this.getReport(id);
      const next = {
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        format: input.format ?? current.format,
      };
      const contentChanged =
        next.title !== current.title || next.body !== current.body || next.format !== current.format;
      const version = contentChanged ? current.version + 1 : current.version;
      const ts = now();
      this.db
        .prepare(
          `UPDATE reports SET title = ?, body = ?, format = ?, summary = ?, project = ?, tags = ?, version = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          next.title,
          next.body,
          next.format,
          input.summary ?? current.summary,
          input.project ?? current.project,
          JSON.stringify(input.tags ? normalizeTags(input.tags) : current.tags),
          version,
          ts,
          id,
        );
      if (contentChanged) {
        this.db
          .prepare(
            `INSERT INTO report_versions (report_id, version, title, format, body, note, agent_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, version, next.title, next.format, next.body, input.note ?? "", agentId, ts);
      }
      return this.getReport(id);
    });
  }

  getReport(id: string): Report {
    const row = this.db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
    if (!row) throw new NotFoundError(`Report ${id} not found`);
    return toReport(row);
  }

  listReports(input: ListReportsInput = {}): { reports: Report[]; total: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (input.query) {
      where.push("(r.title LIKE ? ESCAPE '\\' OR r.summary LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\')");
      // Search for the text literally: % and _ are not wildcards here.
      const like = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
      params.push(like, like, like);
    }
    if (input.project) {
      where.push("r.project = ?");
      params.push(input.project);
    }
    for (const tag of normalizeTags(input.tags ?? [])) {
      where.push("EXISTS (SELECT 1 FROM json_each(r.tags) WHERE json_each.value = ?)");
      params.push(tag);
    }
    if (input.agentId) {
      where.push("r.agent_id = ?");
      params.push(input.agentId);
    }
    if (input.from) {
      where.push("r.created_at >= ?");
      params.push(input.from);
    }
    if (input.to) {
      where.push("r.created_at < ?");
      params.push(input.to);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = input.sort === "oldest" ? "ASC" : "DESC";
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM reports r ${clause}`).get(...params) as { n: number };
    const rows = this.db
      .prepare(`${REPORT_SELECT} ${clause} ORDER BY r.created_at ${order}, r.rowid ${order} LIMIT ? OFFSET ?`)
      .all(...params, input.limit ?? 50, input.offset ?? 0) as Row[];
    return { reports: rows.map(toReport), total: n };
  }

  /** Every tag in use, most used first. */
  listTags(): { tag: string; count: number }[] {
    return this.db
      .prepare(
        `SELECT j.value AS tag, COUNT(*) AS count FROM reports r, json_each(r.tags) j
         GROUP BY j.value ORDER BY count DESC, tag`,
      )
      .all() as unknown as { tag: string; count: number }[];
  }

  listProjects(): { project: string; count: number }[] {
    return this.db
      .prepare("SELECT project, COUNT(*) AS count FROM reports WHERE project != '' GROUP BY project ORDER BY project")
      .all() as unknown as { project: string; count: number }[];
  }

  /** The reports filed just before and just after this one. */
  neighbors(id: string): { newer?: Pick<Report, "id" | "title">; older?: Pick<Report, "id" | "title"> } {
    const r = this.db.prepare("SELECT created_at, rowid FROM reports WHERE id = ?").get(id) as Row | undefined;
    if (!r) return {};
    const newer = this.db
      .prepare(
        `SELECT id, title FROM reports WHERE (created_at, rowid) > (?, ?) ORDER BY created_at ASC, rowid ASC LIMIT 1`,
      )
      .get(r.created_at as string, r.rowid as number) as Pick<Report, "id" | "title"> | undefined;
    const older = this.db
      .prepare(
        `SELECT id, title FROM reports WHERE (created_at, rowid) < (?, ?) ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(r.created_at as string, r.rowid as number) as Pick<Report, "id" | "title"> | undefined;
    return { newer, older };
  }

  listVersions(reportId: string): Omit<ReportVersion, "body">[] {
    return this.db
      .prepare(
        `SELECT v.report_id, v.version, v.title, v.format, v.note, v.created_at, a.name AS agent_name
         FROM report_versions v JOIN agents a ON a.id = v.agent_id
         WHERE v.report_id = ? ORDER BY v.version DESC`,
      )
      .all(reportId) as unknown as Omit<ReportVersion, "body">[];
  }

  getVersion(reportId: string, version: number): ReportVersion {
    const row = this.db
      .prepare(
        `SELECT v.*, a.name AS agent_name FROM report_versions v JOIN agents a ON a.id = v.agent_id
         WHERE v.report_id = ? AND v.version = ?`,
      )
      .get(reportId, version) as unknown as ReportVersion | undefined;
    if (!row) throw new NotFoundError(`Report ${reportId} has no version ${version}`);
    return row;
  }

  deleteReport(id: string) {
    this.db.prepare("DELETE FROM reports WHERE id = ?").run(id);
  }
}
