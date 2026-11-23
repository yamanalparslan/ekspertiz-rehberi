import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Geliştirme ortamında Cloudflare bağlamını (env, bindings) açar.
initOpenNextCloudflareForDev();
