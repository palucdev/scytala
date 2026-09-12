import type { Dashboard, Note } from "@/client/db-client";
import type { DashboardDto, NoteDto } from "./components";

export function mapDashboardToDto(dashboard: Dashboard): DashboardDto {
  return {
    title: dashboard.title,
    description: dashboard.description,
  };
}

export function mapNotesToDto(notes: Note[] = []): NoteDto[] {
  return [...(notes || [])]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content.slice(0, 300),
      version: note.version,
      updated_at: note.updated_at,
    }));
}
