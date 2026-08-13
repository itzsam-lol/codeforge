import type { MetadataRoute } from "next";

// Internal ops console — never meant to be crawled or indexed, including
// the public per-client status page (which sets its own noindex too, since
// its URL is the kind that ends up pasted into Slack/email and could get
// crawled from there).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
