import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow phone/tablet access via LAN IP during dev (fixes stuck skeleton / HMR block).
   *  LAN IPs change with DHCP — add new ones here and restart `npm run dev`.
   *  Wildcards cover common private subnets so a changed last octet still works. */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "172.16.4.61",
    "172.16.4.183",
    "172.16.4.*",
    "192.168.8.100",
    "192.168.8.*",
    "192.168.1.*",
    "192.168.0.*",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
