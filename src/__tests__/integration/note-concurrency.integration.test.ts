import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Note } from "@/client/db-client";
import {
  cleanupIntegrationTestDashboard,
  createIntegrationTestDashboard,
  type IntegrationTestDashboard,
} from "./test-db-helper";

describe("Note Versioning & Concurrency Integrity Integration", () => {
  let workspace: IntegrationTestDashboard;

  beforeAll(async () => {
    workspace = await createIntegrationTestDashboard({
      title: "Note Concurrency Integration Workspace",
      users: [{ alias: "Author", password: "Integration-Pass-1" }],
    });
  });

  afterAll(async () => {
    if (workspace?.dashboardId) {
      await cleanupIntegrationTestDashboard(workspace.dashboardId);
    }
  });

  async function createNote(title: string, content: string): Promise<Note> {
    const { note } = await workspace.db.createNote({
      dashboard_id: workspace.dashboardId,
      title,
      content,
    });
    expect(note.version).toBe(1);
    return note;
  }

  it("advances versions sequentially and persists every snapshot", async () => {
    const note = await createNote("Sequential Note", "sequential v1 content");

    const second = await workspace.db.updateNote({
      note_id: note.id,
      content: "sequential v2 content",
      expected_version: 1,
    });
    expect(second.note.version).toBe(2);
    expect(second.note.content).toBe("sequential v2 content");

    const third = await workspace.db.updateNote({
      note_id: note.id,
      content: "sequential v3 content",
      expected_version: 2,
    });
    expect(third.note.version).toBe(3);

    const stored = await workspace.db.getNoteById(note.id);
    expect(stored?.version).toBe(3);
    expect(stored?.content).toBe("sequential v3 content");

    const versions = await workspace.db.getNoteVersions(note.id);
    expect(versions).toHaveLength(3);
    const sorted = versions.map((v) => v.version).sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3]);
    expect(versions.map((v) => v.content)).toEqual(
      expect.arrayContaining([
        "sequential v1 content",
        "sequential v2 content",
        "sequential v3 content",
      ]),
    );
  });

  it("races two concurrent updates on expected_version 1: exactly one commits, one rolls back", async () => {
    const note = await createNote("Race Note", "race base content");

    const results = await Promise.allSettled([
      workspace.db.updateNote({
        note_id: note.id,
        content: "Writer A content",
        expected_version: 1,
      }),
      workspace.db.updateNote({
        note_id: note.id,
        content: "Writer B content",
        expected_version: 1,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = fulfilled[0] as PromiseFulfilledResult<{
      note: Note;
      newVersion: unknown;
    }>;
    const loser = rejected[0] as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(Error);
    expect((loser.reason as Error).message).toContain(
      "Version mismatch or note not found",
    );

    const winnerContent = winner.value.note.content;
    const loserDraft =
      winnerContent === "Writer A content"
        ? "Writer B content"
        : "Writer A content";

    const stored = await workspace.db.getNoteById(note.id);
    expect(stored?.version).toBe(2);
    expect(stored?.content).toBe(winnerContent);
    expect(stored?.content).not.toBe(loserDraft);

    const versions = await workspace.db.getNoteVersions(note.id);
    expect(versions).toHaveLength(2);
    const sorted = versions.map((v) => v.version).sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2]);
    expect(versions.map((v) => v.content)).toContain(winnerContent);
    expect(versions.map((v) => v.content)).not.toContain(loserDraft);
  });

  it("rejects a stale expected_version without modifying the note or history", async () => {
    const note = await createNote("Stale Note", "stale v1 content");

    await workspace.db.updateNote({
      note_id: note.id,
      content: "stale v2 content",
      expected_version: 1,
    });

    await expect(
      workspace.db.updateNote({
        note_id: note.id,
        content: "stale rejected attempt",
        expected_version: 1,
      }),
    ).rejects.toThrow(/Version mismatch or note not found/);

    const stored = await workspace.db.getNoteById(note.id);
    expect(stored?.version).toBe(2);
    expect(stored?.content).toBe("stale v2 content");

    const versions = await workspace.db.getNoteVersions(note.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.content)).not.toContain(
      "stale rejected attempt",
    );
  });

  it("accepts a fresh expected_version after a conflict and advances to v3", async () => {
    const note = await createNote("Recovery Note", "recovery v1 content");

    await workspace.db.updateNote({
      note_id: note.id,
      content: "recovery v2 content",
      expected_version: 1,
    });

    const result = await workspace.db.updateNote({
      note_id: note.id,
      content: "recovery v3 content",
      expected_version: 2,
    });
    expect(result.note.version).toBe(3);

    const stored = await workspace.db.getNoteById(note.id);
    expect(stored?.version).toBe(3);
    expect(stored?.content).toBe("recovery v3 content");

    const versions = await workspace.db.getNoteVersions(note.id);
    expect(versions).toHaveLength(3);
    const sorted = versions.map((v) => v.version).sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3]);
  });
});
