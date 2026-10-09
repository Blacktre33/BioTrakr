import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/), including the
  // workspace packages it uses.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
