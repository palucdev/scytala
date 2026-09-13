import type { Dashboard, DashboardNote } from "@/client/db-client";
import type { DashboardDto, NoteDto } from "./components";

export function mapDashboardToDto(dashboard: Dashboard): DashboardDto {
  return {
    title: dashboard.title,
    description: dashboard.description,
  };
}

export function mapNotesToDto(notes: DashboardNote[] = []): NoteDto[] {
  const updatedAt = (item: DashboardNote) =>
    item.status === "ok" ? item.note.updated_at : item.updated_at;

  return [...(notes || [])]
    .sort(
      (a, b) =>
        new Date(updatedAt(b)).getTime() - new Date(updatedAt(a)).getTime(),
    )
    .map((item) =>
      item.status === "ok"
        ? {
            id: item.note.id,
            title: item.note.title,
            content: item.note.content.slice(0, 300),
            version: item.note.version,
            updated_at: item.note.updated_at,
          }
        : {
            id: item.id,
            title: "",
            content: "",
            version: item.version,
            updated_at: item.updated_at,
            decryptionFailed: true,
          },
    );
}
