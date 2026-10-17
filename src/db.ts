import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Each entry runs once, in order. Append new migrations; never edit old ones.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE agents (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at   TEXT
  );

  CREATE TABLE reports (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    project     TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    format      TEXT NOT NULL,
    body        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    agent_id    TEXT NOT NULL REFERENCES agents(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX reports_created ON reports(created_at DESC);

  CREATE TABLE report_versions (
    report_id  TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    version    INTEGER NOT NULL,
    title      TEXT NOT NULL,
    format     TEXT NOT NULL,
    body       TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    agent_id   TEXT NOT NULL REFERENCES agents(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (report_id, version)
  );
  `,
];

export type DB = DatabaseSync;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
