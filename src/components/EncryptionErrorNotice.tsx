import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Typography from "@mui/material/Typography";

export interface EncryptionErrorNoticeProps {
  scope?: "note" | "title";
}

export function EncryptionErrorNotice({ scope = "note" }: EncryptionErrorNoticeProps) {
  return (
    <Alert severity="error" role="alert">
      <AlertTitle>
        {scope === "title" ? "Title unavailable" : "Note unavailable"}
      </AlertTitle>
      <Typography variant="body2">
        We could not safely read this {scope === "title" ? "note's title" : "note"}
        {" "}because of a problem with its stored encryption. Its content is not
        displayed to protect you from malformed data. Please try again later.
      </Typography>
    </Alert>
  );
}

export default EncryptionErrorNotice;
