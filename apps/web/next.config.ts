import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  turbopack: {},
  webpack: (config) => {
      config.resolve.alias["@biotrakr/utils/telemetry-mock"] = path.resolve(
      __dirname,
      "../../packages/utils/src/telemetry-mock.ts",
    );
    return config;
  },
};

export default nextConfig;
