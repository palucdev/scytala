import Link from "next/link";
import Image from "next/image";

function FeatureItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="text-center max-w-[240px]">
      <h3
        style={{
          fontFamily: '"IM Fell English", Georgia, serif',
          fontSize: "1.125rem",
          fontWeight: 400,
          color: "var(--papyrus-accent)",
          marginBottom: "0.375rem",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "0.95rem",
          lineHeight: 1.6,
          color: "var(--papyrus-text-secondary)",
          margin: 0,
        }}
      >
        {description}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem 1.5rem",
        background: `
          radial-gradient(ellipse at 20% 50%, rgba(201, 169, 110, 0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 50%, rgba(139, 94, 60, 0.06) 0%, transparent 50%),
          var(--papyrus-bg)
        `,
        /* Subtle paper texture via noise */
        backgroundImage: `
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23f5ead0'/%3E%3Crect width='1' height='1' fill='%23efe0c4' opacity='0.4'/%3E%3C/svg%3E"),
          radial-gradient(ellipse at 20% 50%, rgba(201, 169, 110, 0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 50%, rgba(139, 94, 60, 0.06) 0%, transparent 50%)
        `,
      }}
    >
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2rem",
          maxWidth: "560px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3rem",
          }}
        >
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
          <h1
            style={{
              fontFamily: '"IM Fell English", Georgia, serif',
              fontSize: "clamp(2.5rem, 6vw, 3.5rem)",
              fontWeight: 400,
              letterSpacing: "0.04em",
              color: "var(--papyrus-text)",
              margin: 0,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            Scytala
          </h1>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            width: "100%",
            maxWidth: "200px",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background:
                "linear-gradient(to right, transparent, var(--papyrus-border))",
            }}
          />
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--papyrus-highlight)",
              opacity: 0.6,
            }}
          />
          <div
            style={{
              flex: 1,
              height: "1px",
              background:
                "linear-gradient(to left, transparent, var(--papyrus-border))",
            }}
          />
        </div>

        <p
          style={{
            fontSize: "clamp(1.05rem, 2.5vw, 1.2rem)",
            lineHeight: 1.75,
            color: "var(--papyrus-text-secondary)",
            textAlign: "center",
            margin: 0,
            maxWidth: "460px",
          }}
        >
          Share your dynamic hypermedia content: notes, documents, images and
          more. All with full end-to-end encryption.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "2rem",
            marginTop: "0.5rem",
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
        </div>

        <Link
          href="/app"
          id="get-started-link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "1rem",
            padding: "0.875rem 2.5rem",
            fontFamily: '"IM Fell English", Georgia, serif',
            fontSize: "1.1rem",
            letterSpacing: "0.03em",
            color: "#f5ead0",
            background: "var(--papyrus-accent)",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            textDecoration: "none",
            transition: "background 0.2s ease, transform 0.15s ease",
          }}
        >
          Get Started
          <span aria-hidden="true" style={{ fontSize: "1.2em" }}>
            →
          </span>
        </Link>

        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--papyrus-text-muted)",
            textAlign: "center",
            margin: 0,
            marginTop: "0.5rem",
          }}
        >
          No account required · Free to use · Open source
        </p>
      </main>

    </div>
  );
}
