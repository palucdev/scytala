import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

import { FormattedDate } from "./FormattedDate";

export interface TileMetaProps {
  versionLabel: string;
  updatedAt: string;
}

/** Tile footer showing the version chip and last-updated date. */
export function TileMeta({ versionLabel, updatedAt }: TileMetaProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        justifyContent: "space-between",
        alignItems: "center",
        pt: 1,
        borderTop: "1px solid",
        borderColor: "divider",
        mt: "auto",
        flexShrink: 0,
      }}
    >
      <Chip
        label={versionLabel}
        size="small"
        variant="outlined"
        sx={{
          fontWeight: 600,
          fontSize: "0.75rem",
          height: 22,
          borderColor: "divider",
          color: "text.secondary",
        }}
      />
      <FormattedDate
        date={updatedAt}
        sx={{
          color: "text.disabled",
          fontFamily: "monospace",
          fontSize: "0.75rem",
        }}
      />
    </Stack>
  );
}

export default TileMeta;
