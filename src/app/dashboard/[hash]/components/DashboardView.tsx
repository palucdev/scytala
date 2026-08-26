import Box from "@mui/material/Box";
import Container from "@mui/material/Container";

import type { Dashboard, Note } from "@/client/db-client";
import { DashboardHeader } from "./DashboardHeader";
import { NoteGrid } from "./NoteGrid";
import { EmptyNotesState } from "./EmptyNotesState";

export interface DashboardViewProps {
  dashboard: Dashboard;
  userAlias: string;
  notes: Note[];
}

export function DashboardView({
  dashboard,
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
