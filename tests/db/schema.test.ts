import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/db/schema.js";
import path from "path";
import os from "os";
import fs from "fs";

describe("createDatabase", () => {
  it("creates all four tables in an in-memory database", () => {
    const db = createDatabase(":memory:");

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("posts");
    expect(tableNames).toContain("analytics");
    expect(tableNames).toContain("competitor_snapshots");
    expect(tableNames).toContain("content_calendar");

    db.close();
  });

  it("enables WAL mode", () => {
    // Note: WAL mode only works with file-based databases, not in-memory databases
    const tmpDir = os.tmpdir();
    const dbPath = path.join(tmpDir, `marketing-agent-test-${Date.now()}.db`);

    try {
      const db = createDatabase(dbPath);
      const result = db.prepare("PRAGMA journal_mode").get() as {
        journal_mode: string;
      };
      expect(result.journal_mode).toBe("wal");
      db.close();
    } finally {
      // Clean up test database files
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      try {
        fs.unlinkSync(dbPath + "-wal");
      } catch (e) {
        // Ignore cleanup errors
      }
      try {
        fs.unlinkSync(dbPath + "-shm");
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
});
