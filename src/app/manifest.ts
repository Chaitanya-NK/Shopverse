import type { MetadataRoute } from "next";

/** The staff app, installable for quick access to orders and stock. Shops have their own. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Shopverse",
    short_name: "Shopverse",
    description: "Run your shops: orders, stock, deliveries and more.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d6b5c",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
