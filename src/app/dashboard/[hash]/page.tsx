import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import {
  createDatabaseClient,
  type Dashboard,
  type Note,
} from "@/client/db-client";
import {
  getSessionCookieName,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import {
  LoginForm,
  DashboardView,
  type DashboardDto,
  type NoteDto,
} from "./components";

export const dynamic = "force-dynamic";

export interface DashboardPageProps {
  params: Promise<{ hash: string }>;
}

export function mapDashboardToDto(dashboard: Dashboard): DashboardDto {
  return {
    title: dashboard.title,
    description: dashboard.description,
  };
}

export function mapNotesToDto(notes: Note[]): NoteDto[] {
  return [...notes]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content,
      version: note.version,
      updated_at: note.updated_at,
    }));
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { hash } = await params;
  if (!hash || hash.trim().length === 0) {
    notFound();
  }

  const db = createDatabaseClient();
  const dashboard = await db.getDashboardByHash(hash.trim());
  if (!dashboard) {
    notFound();
  }

  const cookieStore = await cookies();
  const scopedCookieName = getSessionCookieName(dashboard.hash);
  const rawToken =
    cookieStore.get(scopedCookieName)?.value ||
    cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const secret = getSessionSecret();

  const session = rawToken ? await verifySessionToken(rawToken, secret) : null;
  const isAuthenticated =
    session !== null &&
    session.dashboard_id === dashboard.id &&
    session.dashboard_hash === dashboard.hash;

  if (!isAuthenticated) {
    return <LoginForm dashboardHash={hash.trim()} />;
  }

  const rawNotes = await db.getNotesByDashboard(dashboard.id);
  const notes = mapNotesToDto(rawNotes);
  const dashboardDto = mapDashboardToDto(dashboard);

  return (
    <DashboardView
      dashboard={dashboardDto}
      dashboardHash={dashboard.hash}
      userAlias={session.user_alias}
      notes={notes}
    />
  );
}
