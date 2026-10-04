// SQLite via node:sqlite (built into Node 22.13+). No native build step.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function openDb(dbPath = ":memory:") {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT, address TEXT, job_type TEXT DEFAULT 'unknown', urgency TEXT DEFAULT 'unknown',
      summary TEXT, status TEXT DEFAULT 'new',       -- new | texting | quote_ready | handoff | booked | lost | opted_out
      photos TEXT DEFAULT '[]',
      source TEXT DEFAULT 'missed_call',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_outbound_at TEXT, last_inbound_at TEXT,
      nudges_sent INTEGER DEFAULT 0,
      owner_notified INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      direction TEXT NOT NULL,                       -- in | out
      body TEXT NOT NULL,
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    );
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT UNIQUE, from_phone TEXT, outcome TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export function upsertLead(db, phone, patch = {}) {
  const existing = db.prepare("SELECT * FROM leads WHERE phone = ?").get(phone);
  if (!existing) {
    db.prepare("INSERT INTO leads (phone, source) VALUES (?, ?)").run(phone, patch.source || "missed_call");
  }
  const lead = db.prepare("SELECT * FROM leads WHERE phone = ?").get(phone);
  return patch && Object.keys(patch).length ? updateLead(db, lead.id, patch) : lead;
}

const LEAD_COLUMNS = new Set(["name", "address", "job_type", "urgency", "summary", "status", "photos",
  "last_outbound_at", "last_inbound_at", "nudges_sent", "owner_notified", "source"]);

export function updateLead(db, id, patch) {
  const keys = Object.keys(patch).filter((k) => LEAD_COLUMNS.has(k) && patch[k] !== undefined && patch[k] !== null);
  if (keys.length) {
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const vals = keys.map((k) => (k === "photos" ? JSON.stringify(patch[k]) : patch[k]));
    db.prepare(`UPDATE leads SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
  }
  return getLead(db, id);
}

export function getLead(db, id) {
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  return row ? { ...row, photos: JSON.parse(row.photos || "[]") } : null;
}

export function getLeadByPhone(db, phone) {
  const row = db.prepare("SELECT * FROM leads WHERE phone = ?").get(phone);
  return row ? { ...row, photos: JSON.parse(row.photos || "[]") } : null;
}

export function addMessage(db, leadId, direction, body, media = []) {
  db.prepare("INSERT INTO messages (lead_id, direction, body, media) VALUES (?, ?, ?, ?)")
    .run(leadId, direction, body, JSON.stringify(media));
  const col = direction === "in" ? "last_inbound_at" : "last_outbound_at";
  db.prepare(`UPDATE leads SET ${col} = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(leadId);
}

export function getTranscript(db, leadId) {
  return db.prepare("SELECT direction, body, media, created_at FROM messages WHERE lead_id = ? ORDER BY id").all(leadId)
    .map((m) => ({ ...m, media: JSON.parse(m.media || "[]") }));
}

export function recordCall(db, callSid, fromPhone, outcome) {
  db.prepare("INSERT OR REPLACE INTO calls (call_sid, from_phone, outcome) VALUES (?, ?, ?)").run(callSid, fromPhone, outcome);
}

export function listLeads(db, { status } = {}) {
  const rows = status
    ? db.prepare("SELECT * FROM leads WHERE status = ? ORDER BY updated_at DESC").all(status)
    : db.prepare("SELECT * FROM leads ORDER BY updated_at DESC").all();
  return rows.map((r) => ({ ...r, photos: JSON.parse(r.photos || "[]") }));
}

export function staleLeads(db, minutesSinceOutbound, maxNudges) {
  return db.prepare(`
    SELECT * FROM leads
    WHERE status = 'texting' AND nudges_sent < ?
      AND last_outbound_at IS NOT NULL
      AND (last_inbound_at IS NULL OR last_inbound_at < last_outbound_at)
      AND last_outbound_at < datetime('now', ?)
  `).all(maxNudges, `-${minutesSinceOutbound} minutes`).map((r) => ({ ...r, photos: JSON.parse(r.photos || "[]") }));
}

export function todayStats(db) {
  const calls = db.prepare("SELECT COUNT(*) AS n FROM calls WHERE created_at >= date('now')").get().n;
  const textedBack = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at >= date('now')").get().n;
  const replied = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at >= date('now') AND last_inbound_at IS NOT NULL").get().n;
  const quoteReady = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE updated_at >= date('now') AND status IN ('quote_ready','handoff')").get().n;
  return { calls, textedBack, replied, quoteReady };
}
