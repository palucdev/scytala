import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { createDatabaseClient } from "@/client/db-client";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { LoginForm, DashboardView } from "./components";

export const dynamic = "force-dynamic";

export interface DashboardPageProps {
  params: Promise<{ hash: string }>;
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
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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
  const notes = [...rawNotes].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <DashboardView
      dashboard={dashboard}
      userAlias={session.user_alias}
      notes={notes}
    />
  );
}
