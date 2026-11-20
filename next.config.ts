import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge out of client demos and screenshots.
  devIndicators: false,
  poweredByHeader: false,
  // PDFs (invoices, payslips, challans, ID cards): pdfkit loads its built-in fonts through a
  // package "#standard-fonts" import that Vercel's file tracing does not follow, so the font
  // files must be shipped with every server function explicitly.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/data/**",
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/package.json",
    ],
  },
};

export default nextConfig;
