import { describe, it, expect } from "vitest";
import {
  createNoteSchema,
  updateNoteSchema,
  deleteNoteSchema,
} from "@/schemas/notes";

describe("src/schemas/notes.ts", () => {
  describe("createNoteSchema", () => {
    it("parses valid input with title and content", () => {
      const input = {
        dashboardHash: "AbCdEfGh12345678",
        title: "Meeting Notes",
        content: "Discuss roadmap and launch targets.",
      };
      const result = createNoteSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dashboardHash: "AbCdEfGh12345678",
          title: "Meeting Notes",
          content: "Discuss roadmap and launch targets.",
        });
      }
    });

    it("parses valid input without optional title", () => {
      const input = {
        dashboardHash: "AbCdEfGh12345678",
        content: "Just plain note content.",
      };
      const result = createNoteSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBeUndefined();
        expect(result.data.content).toBe("Just plain note content.");
      }
    });

    it("transforms null and empty string titles to undefined", () => {
      const resultNull = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        title: null,
        content: "Content with null title",
      });
      expect(resultNull.success).toBe(true);
      if (resultNull.success) {
        expect(resultNull.data.title).toBeUndefined();
      }

      const resultEmpty = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        title: "   ",
        content: "Content with whitespace title",
      });
      expect(resultEmpty.success).toBe(true);
      if (resultEmpty.success) {
        expect(resultEmpty.data.title).toBeUndefined();
      }
    });

    it("trims whitespace from dashboardHash and title", () => {
      const input = {
        dashboardHash: "  AbCdEfGh12345678  ",
        title: "  Trimmed Title  ",
        content: "Content with preserved spaces  ",
      };
      const result = createNoteSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dashboardHash).toBe("AbCdEfGh12345678");
        expect(result.data.title).toBe("Trimmed Title");
        expect(result.data.content).toBe("Content with preserved spaces  ");
      }
    });

    it("rejects empty dashboardHash", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "   ",
        content: "Some content",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Dashboard identifier is required",
        );
      }
    });

    it("rejects empty content", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        content: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Note content cannot be empty",
        );
      }
    });

    it("rejects whitespace-only content", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        content: "   \n\t  ",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Note content cannot be empty",
        );
      }
    });

    it("rejects title exceeding 200 characters", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        title: "a".repeat(201),
        content: "Some content",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Title must not exceed 200 characters",
        );
      }
    });

    it("rejects content exceeding 10,000 characters", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        content: "a".repeat(10001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Note content must not exceed 10,000 characters",
        );
      }
    });

    it("accepts boundary content length of 10,000 characters", () => {
      const result = createNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        content: "a".repeat(10000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateNoteSchema", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("parses valid update input", () => {
      const input = {
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        title: "Updated Title",
        content: "Updated content",
        expectedVersion: 1,
      };
      const result = updateNoteSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          dashboardHash: "AbCdEfGh12345678",
          noteId: validUuid,
          title: "Updated Title",
          content: "Updated content",
          expectedVersion: 1,
        });
      }
    });

    it("transforms null and empty string titles to undefined in updateNoteSchema", () => {
      const resultNull = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        title: null,
        content: "Updated content",
        expectedVersion: 1,
      });
      expect(resultNull.success).toBe(true);
      if (resultNull.success) {
        expect(resultNull.data.title).toBeUndefined();
      }
    });

    it("rejects invalid noteId UUID", () => {
      const result = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: "invalid-uuid",
        content: "Content",
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Invalid note ID format");
      }
    });

    it("rejects whitespace-only content in updateNoteSchema", () => {
      const result = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        content: "   \t\n  ",
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Note content cannot be empty",
        );
      }
    });

    it("rejects expectedVersion less than or equal to 0", () => {
      const resultZero = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        content: "Content",
        expectedVersion: 0,
      });
      expect(resultZero.success).toBe(false);

      const resultNegative = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        content: "Content",
        expectedVersion: -1,
      });
      expect(resultNegative.success).toBe(false);
    });

    it("rejects non-integer expectedVersion", () => {
      const result = updateNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        content: "Content",
        expectedVersion: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("deleteNoteSchema", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("parses valid delete input", () => {
      const input = {
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        password: "secretPassword123",
      };
      const result = deleteNoteSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects empty password", () => {
      const result = deleteNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        password: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Password is required");
      }
    });

    it("rejects password exceeding 128 characters", () => {
      const result = deleteNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: validUuid,
        password: "p".repeat(129),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Password is too long");
      }
    });

    it("rejects invalid UUID in deleteNoteSchema", () => {
      const result = deleteNoteSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        noteId: "non-uuid-string",
        password: "secretPassword123",
      });
      expect(result.success).toBe(false);
    });
  });
});
