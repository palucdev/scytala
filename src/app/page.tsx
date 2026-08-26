import Image from "next/image";
import { getLatestDeploymentInfo } from "@/actions/audit";
import dayjs from "dayjs";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export const dynamic = "force-dynamic";

function FeatureItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ textAlign: "center", maxWidth: 240 }}>
      <Typography variant="h3" sx={{ color: "primary.main", mb: "0.375rem" }}>
        {title}
      </Typography>
      <Typography
        variant="caption"
        component="p"
        sx={{ color: "text.secondary", m: 0 }}
      >
        {description}
      </Typography>
    </Box>
  );
}

export default async function Home() {
  const deploymentInfo = await getLatestDeploymentInfo();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        px: "1.5rem",
        py: "2rem",
      }}
    >
      <Container
        component="main"
        maxWidth={false}
        disableGutters
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2rem",
          maxWidth: 560,
          width: "100%",
        }}
      >
        <Stack sx={{ alignItems: "center" }} spacing="3rem">
          <Image
            src="/logo.svg"
            alt="Scytala cipher logo"
            width={340}
            height={65}
            priority
            style={{
              width: "clamp(220px, 50vw, 340px)",
              height: "auto",
              filter: "drop-shadow(0 3px 10px rgba(35, 24, 13, 0.14))",
            }}
          />
          <Typography
            variant="h1"
            sx={{
              fontSize: "clamp(2.5rem, 6vw, 3.5rem)",
              color: "text.primary",
              m: 0,
              textAlign: "center",
            }}
          >
            Scytala
          </Typography>
        </Stack>

        <Stack
          direction="row"
          spacing="0.75rem"
          sx={{ alignItems: "center", width: "100%", maxWidth: 200 }}
          aria-hidden="true"
        >
          <Divider
            sx={{
              flex: 1,
              borderImage: "linear-gradient(to right, transparent, #cfbe97) 1",
            }}
          />
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "secondary.main",
              opacity: 0.6,
            }}
          />
          <Divider
            sx={{
              flex: 1,
              borderImage: "linear-gradient(to left, transparent, #cfbe97) 1",
            }}
          />
        </Stack>

        <Typography
          variant="body1"
          sx={{
            fontSize: "clamp(1.05rem, 2.5vw, 1.2rem)",
            color: "text.secondary",
            textAlign: "center",
            m: 0,
            maxWidth: 460,
          }}
        >
          Share your dynamic hypermedia content: notes, documents, images and
          more. All with full end-to-end encryption.
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "2rem",
            mt: "0.5rem",
          }}
        >
          <FeatureItem
            title="Create"
            description="Create secure notes, documents, images and more in form of handy dashboards"
          />
          <FeatureItem
            title="Share"
            description="Send your content in form of shareable links to selected friends."
          />
          <FeatureItem
            title="Cooperate"
            description="Modify shared content together with your friends, all secured and private"
          />
        </Box>

        <Button
          href="/new"
          id="get-started-link"
          variant="contained"
          color="primary"
          sx={{ mt: "1rem", gap: "0.5rem" }}
        >
          Get Started
          <Box component="span" aria-hidden="true" sx={{ fontSize: "1.2em" }}>
            →
          </Box>
        </Button>

        <Typography
          variant="caption"
          component="p"
          sx={{
            color: "text.disabled",
            textAlign: "center",
            m: 0,
            mt: "0.5rem",
          }}
        >
          No account required · Free to use · Open source
        </Typography>

        <Box
          sx={{
            color: "text.disabled",
            textAlign: "center",
            m: 0,
            mt: "0.5rem",
          }}
        >
          <Typography variant="caption" component="p">
            Version: {deploymentInfo?.app_version}
          </Typography>
          <Typography variant="caption" component="p">
            {dayjs(deploymentInfo?.created_at).format("YYYY-MM-DD HH:mm")}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
