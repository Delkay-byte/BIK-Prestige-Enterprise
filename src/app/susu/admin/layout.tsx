"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/actions/auth.actions";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ href: "/admin/dashboard", label: "Dashboard", icon: "📊" }],
  },
  {
    title: "MoMo",
    items: [
      { href: "/admin/locations", label: "Locations", icon: "📍" },
      { href: "/admin/workers", label: "Workers", icon: "👥" },
      { href: "/admin/reports", label: "Reports", icon: "📋" },
    ],
  },
  {
    title: "Susu",
    items: [
      { href: "/susu/admin", label: "Overview", icon: "💰" },
      { href: "/susu/admin/customers", label: "Customers", icon: "🧑" },
      { href: "/susu/admin/collectors", label: "Collectors", icon: "🚶" },
      { href: "/susu/admin/contributions", label: "Contributions", icon: "💵" },
      { href: "/susu/admin/withdrawals", label: "Withdrawals", icon: "🏧" },
      { href: "/susu/admin/remittances", label: "Remittances", icon: "🏦" },
      { href: "/susu/admin/reports", label: "Reports", icon: "📑" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/audit", label: "Audit Log", icon: "📝" },
      { href: "/settings", label: "Settings", icon: "⚙️" },
    ],
  },
];

export default function SusuAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
  }

  function isActive(href: string) {
    if (href === "/admin/dashboard") return pathname === href;
    // Susu overview needs exact match to avoid highlighting on child routes
    if (href === "/susu/admin") return pathname === "/susu/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-600 hover:text-gray-800">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-bold text-green-700">BIK Prestige</span>
        <span className="text-sm text-gray-500">Susu Admin</span>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform md:translate-x-0 overflow-y-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-green-700">BIK Prestige Enterprise</h1>
          <p className="text-xs text-gray-400 mt-1">Built by BloomCore Technologies</p>
        </div>
        <nav className="p-4">
          {navSections.map((section) => (
            <div key={section.title || "main"} className="mb-4">
              {section.title && (
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                  {section.title}
                </h3>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-green-50 text-green-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 w-full transition-colors">
            <span className="text-lg">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:ml-64 min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
