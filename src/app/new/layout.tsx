// Applied here (not in page.tsx) because route segment config is only read in
// server components, and the wizard page is a "use client" component.
export const dynamic = "force-dynamic";

export default function NewDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
