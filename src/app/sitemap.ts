import type { MetadataRoute } from "next";
import { site } from "../../config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/decisions", "/tasks", "/models", "/desks", "/premium", "/network", "/points", "/operations", "/changes", "/roadmap", "/how-it-works", "/post", "/testnet", "/terms", "/privacy"];
  return paths.map((p) => ({ url: site.url + p, lastModified: new Date(), priority: p === "" ? 1 : 0.7 }));
}
