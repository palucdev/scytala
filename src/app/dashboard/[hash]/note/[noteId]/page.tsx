import { notFound } from "next/navigation";

import { createDatabaseClient } from "@/client/db-client";
import { verifyDashboardSession } from "@/lib/auth-guard";
import { LoginForm } from "@/app/dashboard/[hash]/components/LoginForm";
import { NoteEditor } from "./components/NoteEditor";

export const dynamic = "force-dynamic";

export interface NoteEditorPageProps {
  params: Promise<{
    hash: string;
    noteId: string;
  }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NoteEditorPage({ params }: NoteEditorPageProps) {
  const { hash, noteId } = await params;
  if (!hash || hash.trim().length === 0 || !noteId || noteId.trim().length === 0) {
    notFound();
  }

  const normalizedHash = hash.trim();
  const normalizedNoteId = noteId.trim();

  const db = createDatabaseClient();
  const dashboard = await db.getDashboardByHash(normalizedHash);
  if (!dashboard) {
    notFound();
  }

  const session = await verifyDashboardSession(dashboard.hash);
  const isAuthenticated =
    session !== null && session.dashboard_id === dashboard.id;

  if (!isAuthenticated) {
    return <LoginForm dashboardHash={dashboard.hash} />;
  }

  if (normalizedNoteId === "new") {
    return (
      <NoteEditor
        mode="create"
        dashboardHash={dashboard.hash}
        authorId={session.user_id}
        userAlias={session.user_alias}
      />
    );
  }

  if (!UUID_REGEX.test(normalizedNoteId)) {
    notFound();
  }

  const note = await db.getNoteById(normalizedNoteId);
  if (!note || note.dashboard_id !== dashboard.id) {
    notFound();
  }

  return (
    <NoteEditor
      key={`${note.id}-${note.version}`}
      mode="edit"
      dashboardHash={dashboard.hash}
      noteId={note.id}
      initialTitle={note.title}
      initialContent={note.content}
      initialVersion={note.version}
      authorId={session.user_id}
      userAlias={session.user_alias}
    />
  );
}
