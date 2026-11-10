import type { NextConfig } from "next";

// Scaffold-owned. Changes go through a Contract change request.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Bryntum ships ESM + CSS; let Next transpile the React wrapper.
  transpilePackages: ["@bryntum/gantt-react"],
  // Type errors fail the build; lint is not configured in this repo (tsc + vitest are the gates).
  eslint: { ignoreDuringBuilds: true },
  // The JSON store and the PayPal Agent Toolkit are Node-only; keep them out of client bundles.
  serverExternalPackages: ["@paypal/agent-toolkit"],
};

export default nextConfig;
