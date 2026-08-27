"use client";

import { useSyncExternalStore } from "react";
import dayjs from "dayjs";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

const emptySubscribe = () => () => {};

export interface FormattedDateProps {
  date: string | number | Date;
  format?: string;
  variant?: TypographyProps["variant"];
  sx?: SxProps<Theme>;
  className?: string;
}

export function FormattedDate({
  date,
  format = "YYYY-MM-DD HH:mm",
  variant = "caption",
  sx,
  className,
}: FormattedDateProps) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const formattedDate = isMounted && date ? dayjs(date).format(format) : "";

  return (
    <Typography
      variant={variant}
      className={className}
      suppressHydrationWarning
      sx={sx}
    >
      {formattedDate}
    </Typography>
  );
}

export default FormattedDate;
