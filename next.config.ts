import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The brand deal room carries its authorisation in the path, so the
        // path must not travel. no-referrer stops the token leaving in a
        // Referer header when someone clicks a link on the page, and noindex
        // keeps it out of search results if a URL is ever pasted publicly.
        source: "/b/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
