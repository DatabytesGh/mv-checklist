import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maya Villa Checklists",
    short_name: "MV Checklists",
    description: "Hotel daily and conference checklists",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050509",
    theme_color: "#050509",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
