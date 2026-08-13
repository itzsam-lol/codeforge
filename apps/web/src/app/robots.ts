import type { MetadataRoute } from "next";

// Every route here is either an authenticated recruiter dashboard or a
// candidate test-invitation link — never content meant to be crawled or
// indexed. Blanket-disallow rather than enumerating exceptions.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
