import type { Metadata } from "next";
import { Jost } from "next/font/google";
import { siteUrl } from "@/lib/deals/brandAccess";
import "./globals.css";

/** The logo is set in Jost; self-hosted by next/font so there is no external
 *  request and no layout shift. Only weight 400 is used. */
const jost = Jost({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-jost",
  display: "swap",
});

const TAGLINE = "Your AI agent. Fire your manager, keep the 20%.";

/**
 * Absolute base for the link-preview tags. Slack, iMessage and X fetch og:image
 * over the network from a cold start, so a relative path is no use to them and
 * Next needs a base to make them absolute. Shared with the brand portal's link
 * builder, which needs the same origin for the same reason.
 */
const SITE_URL = siteUrl();

/**
 * og:image and twitter:image are generated from opengraph-image.png and
 * twitter-image.png sitting next to this file — the wordmark on a white ground,
 * screenshotted from the real <Logo> component so it can never drift from the
 * one the app renders. Their alt text lives in the matching .alt.txt files.
 * Both paths are excluded from the proxy's matcher; an unfurler arrives with no
 * cookies and a redirect to /login is not an image.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Nspiire",
  description: TAGLINE,
  openGraph: {
    type: "website",
    siteName: "Nspiire",
    title: "Nspiire",
    description: TAGLINE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nspiire",
    description: TAGLINE,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${jost.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
