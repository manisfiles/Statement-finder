import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Statement Finder",
  description: "Client-side bank statement PDF transaction search and analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
