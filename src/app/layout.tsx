import type { Metadata } from "next";
import "./globals.css";
import MUIThemeProvider from "@/providers/mui-theme-provider";

export const metadata: Metadata = {
  title: "Scytala — Secure Content Sharing",
  description:
    "Share your dynamic hypermedia content: notes, documents, images and more. All with full end-to-end encryption.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MUIThemeProvider>{children}</MUIThemeProvider>
      </body>
    </html>
  );
}
