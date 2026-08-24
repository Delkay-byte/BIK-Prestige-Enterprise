import type { NextConfig } from "next";

/**
 * Security headers for BIK Prestige Enterprise.
 *
 * CSP is kept in report-only mode initially to avoid breaking the
 * application.  Once validated, enforce via Content-Security-Policy.
 *
 * Note: Next.js inline scripts for hydration require 'unsafe-inline'
 * in script-src.  This is documented as an accepted exception.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js hydration needs unsafe-inline
  "style-src 'self' 'unsafe-inline'",                   // Tailwind + inline styles
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // CSP in report-only mode first — switch to enforcement once validated
  {
    key: "Content-Security-Policy-Report-Only",
    value: csp,
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
];

/**
 * Headers applied to sensitive authenticated pages.
 * Prevents browser caching of protected content.
 */
const sensitiveHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate",
  },
  {
    key: "Pragma",
    value: "no-cache",
  },
  {
    key: "Expires",
    value: "0",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Protected pages: no browser caching
      {
        source: "/(admin|worker|collector|settings|change-password)/:path*",
        headers: sensitiveHeaders,
      },
      // API routes: no caching of authenticated responses
      {
        source: "/api/(auth|user|audit)/:path*",
        headers: sensitiveHeaders,
      },
    ];
  },
};

export default nextConfig;
