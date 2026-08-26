"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ACCESS_LINKS, type AccessLink } from "@/lib/access-links";

export default function AccessPage() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function fullUrl(path: string): string {
    return origin ? `${origin}${path}` : path;
  }

  async function copy(link: AccessLink) {
    try {
      await navigator.clipboard.writeText(fullUrl(link.shortPath));
      setCopied(link.key);
      setTimeout(() => setCopied((c) => (c === link.key ? null : c)), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="access-wrap min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-emerald-50 to-amber-50 px-4 py-10">
      {/* Print-only friendly summary (full public URLs, no buttons) */}
      <div className="hidden print:block w-full max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center">BIK Prestige Enterprise</h1>
        {ACCESS_LINKS.map((link) => (
          <div key={link.key} className="mt-4">
            <h2 className="text-lg font-semibold">{link.title}</h2>
            <p className="text-sm">{fullUrl(link.shortPath)}</p>
          </div>
        ))}
      </div>

      <div className="w-full max-w-md print:hidden">
        {/* Brand */}
        <div className="text-center mb-7">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-14 w-auto mx-auto"
            width={224}
            height={112}
          />
          <h1 className="sr-only">BIK Prestige Enterprise</h1>
          <p className="text-gray-600 mt-2 text-base font-medium">Choose how you want to sign in</p>
        </div>

        <div className="space-y-3">
          {ACCESS_LINKS.map((link) => (
            <div
              key={link.key}
              className={`card p-5 ${
                link.admin
                  ? "border-2 border-slate-700 bg-slate-900 text-white"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">{link.icon}</span>
                <div className="flex-1 min-w-0">
                  <h2 className={`text-lg font-semibold ${link.admin ? "text-white" : "text-gray-900"}`}>
                    {link.title}
                  </h2>
                  <p className={`text-sm ${link.admin ? "text-slate-300" : "text-gray-500"}`}>
                    {link.description}
                  </p>
                </div>
              </div>

              <p
                className={`text-xs mt-3 ${link.admin ? "text-slate-400" : "text-gray-500"}`}
              >
                {link.instruction}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={link.shortPath}
                  className={`btn access-login-btn w-full text-center print:hidden ${
                    link.admin ? "btn-primary" : "btn-primary"
                  }`}
                >
                  {link.key === "admin" ? "Administrator Login" : `${link.title} Login`}
                </Link>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <code
                  className={`text-xs truncate ${link.admin ? "text-slate-400" : "text-gray-400"}`}
                  title={fullUrl(link.shortPath)}
                >
                  {fullUrl(link.shortPath)}
                </code>
                <button
                  type="button"
                  onClick={() => copy(link)}
                  className={`access-copy-btn text-xs px-2 py-1 rounded-md shrink-0 print:hidden ${
                    link.admin
                      ? "text-slate-200 hover:bg-slate-700"
                      : "text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {copied === link.key ? "Link copied" : "Copy Link"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Built by BloomCore Technologies
        </p>
      </div>
    </div>
  );
}
