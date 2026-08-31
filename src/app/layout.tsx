import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

/** The logo is set in Jost; self-hosted by next/font so there is no external
 *  request and no layout shift. Only weight 400 is used. */
const jost = Jost({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nspiire",
  description: "Your AI agent. Fire your manager, keep the 20%.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${jost.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
