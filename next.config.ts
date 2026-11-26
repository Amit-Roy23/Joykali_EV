import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge out of client demos and screenshots.
  devIndicators: false,
  poweredByHeader: false,
  // PDFs (invoices, payslips, challans, ID cards): pdfkit loads its built-in fonts through a
  // package "#standard-fonts" import that Vercel's file tracing does not follow, so the font
  // files must be shipped with every server function explicitly.
  // Android app (Trusted Web Activity) link file.
  async rewrites() {
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }];
  },
  async headers() {
    return [
      // the service worker must always be fresh so updates reach every phone
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/data/**",
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/package.json",
    ],
  },
};

export default nextConfig;
