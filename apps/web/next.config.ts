import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@carepost/core"],
  agentRules: false,
  async redirects() {
    return [{ source: "/brands/:slug", destination: "/b/:slug", permanent: false }];
  },
};
export default config;
