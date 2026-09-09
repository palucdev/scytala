"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import { loginToDashboardAction } from "@/actions/auth";

export interface LoginFormProps {
  dashboardHash: string;
}

export function LoginForm({ dashboardHash }: LoginFormProps) {
  const router = useRouter();
  const [userAlias, setUserAlias] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    userAlias?: string[];
    password?: string[];
  }>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      setPassword("");
      setShowPassword(false);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await loginToDashboardAction({
        dashboardHash,
        userAlias,
        password,
      });

      if (result.success) {
        setPassword("");
        setShowPassword(false);
        router.refresh();
      } else {
        setError(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 4, sm: 8 },
      }}
    >
      <Container component="main" maxWidth="xs">
        <Card
          sx={{
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            p: { xs: 3, sm: 4 },
            boxShadow: "0 4px 20px rgba(35, 24, 13, 0.08)",
            width: "100%",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <LockOutlinedIcon />
            </Box>
            <Typography
              variant="h3"
              component="h1"
              align="center"
              sx={{ color: "primary.main", mb: 1 }}
            >
              Scytala Dashboard Login
            </Typography>
            <Typography
              variant="body1"
              align="center"
              sx={{ color: "text.secondary" }}
            >
              Enter your participant credentials to access this dashboard.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5 }}>
              {error}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2.5,
            }}
          >
            <TextField
              id="login-user-alias"
              label="User Alias"
              name="userAlias"
              required
              fullWidth
              autoFocus
              autoComplete="username"
              value={userAlias}
              onChange={(e) => setUserAlias(e.target.value)}
              error={Boolean(fieldErrors.userAlias)}
              helperText={fieldErrors.userAlias?.[0]}
              slotProps={{
                htmlInput: {
                  "aria-label": "User Alias",
                  autoCapitalize: "none",
                  autoCorrect: "off",
                  spellCheck: "false",
                },
              }}
            />

            <TextField
              id="login-password"
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              fullWidth
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password?.[0]}
              slotProps={{
                htmlInput: {
                  "aria-label": "Password",
                  autoCapitalize: "none",
                  autoCorrect: "off",
                  spellCheck: "false",
                },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((prev) => !prev)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              disabled={isPending}
              sx={{ mt: 1, py: 1.25 }}
            >
              {isPending ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Sign In"
              )}
            </Button>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}

export default LoginForm;
