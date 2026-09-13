import { notFound } from "next/navigation";

import { createDatabaseClient } from "@/client/db-client";
import {
  verifyDashboardSession,
  SessionRateLimitError,
} from "@/lib/auth-guard";
import { RateLimitNotice } from "@/components";
import { LoginForm, DashboardView } from "./components";
import { mapDashboardToDto, mapNotesToDto } from "./dto";

export const dynamic = "force-dynamic";

export interface DashboardPageProps {
  params: Promise<{ hash: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { hash } = await params;
  if (!hash || hash.trim().length === 0) {
    notFound();
  }

  const normalizedHash = hash.trim();

  let session = null;
  let rateLimitError: SessionRateLimitError | null = null;

  try {
    session = await verifyDashboardSession(normalizedHash, {
      throwOnRateLimit: true,
    });
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      rateLimitError = error;
    } else {
      throw error;
    }
  }

  if (rateLimitError) {
    return <RateLimitNotice retryAfterSeconds={rateLimitError.retryAfterSeconds} />;
  }

  const db = createDatabaseClient();
  const dashboard = await db.getDashboardByHash(normalizedHash);
  if (!dashboard) {
    notFound();
  }

  if (!session || session.dashboard_id !== dashboard.id) {
    return <LoginForm dashboardHash={normalizedHash} />;
  }

  // Undecryptable notes are degraded to placeholder tiles by the adapter;
  // genuine database errors still propagate to the framework error boundary.
  const notes = mapNotesToDto(await db.getNotesByDashboard(dashboard.id));
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
