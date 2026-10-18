import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@carepost/core"],
  agentRules: false,
};
export default config;
