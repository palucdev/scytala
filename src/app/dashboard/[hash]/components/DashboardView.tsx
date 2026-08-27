"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";

import { DashboardHeader } from "./DashboardHeader";
import { NoteGrid } from "./NoteGrid";
import { EmptyNotesState } from "./EmptyNotesState";

export interface DashboardDto {
  title: string;
  description: string | null;
}

export interface NoteDto {
  id: string;
  title: string;
  content: string;
  version: number;
  updated_at: string;
}

export interface DashboardViewProps {
  dashboard: DashboardDto;
  dashboardHash?: string;
  userAlias: string;
  notes: NoteDto[];
}

export function DashboardView({
  dashboard,
  dashboardHash,
  userAlias,
  notes,
}: DashboardViewProps) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        py: { xs: 3, sm: 5 },
        px: { xs: 2, sm: 3 },
      }}
    >
      <Container maxWidth="lg" component="main">
        <DashboardHeader
          title={dashboard.title}
          description={dashboard.description}
          dashboardHash={dashboardHash}
          userAlias={userAlias}
        />

        {notes.length > 0 ? (
          <NoteGrid notes={notes} />
        ) : (
          <EmptyNotesState />
        )}
      </Container>
    </Box>
  );
}

export default DashboardView;
