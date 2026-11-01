/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@vetto/asset-registry", "@vetto/intent-parser", "@vetto/quote-engine", "@vetto/safety-policy"],
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] }];
  },
};
export default nextConfig;
