/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // A service worker that a browser caches can never be updated, so never cache it.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
