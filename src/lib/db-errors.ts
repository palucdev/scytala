/**
 * Typed database error surfaced by the `update_note_with_version` RPC when
 * optimistic concurrency fails (PostgreSQL errcode `P0002`).
 */
export class VersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionConflictError";
  }
}
