"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/actions/auth.actions";

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  async function handleLogout() { await logout(); }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <span className="font-bold text-green-700 text-lg">BIK Prestige</span>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-gray-600 hover:text-gray-800 p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button onClick={() => { router.push("/worker/dashboard"); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">📊 Dashboard</button>
                <button onClick={() => { router.push("/change-password"); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">🔑 Change Password</button>
                <hr className="my-1" />
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">🚪 Sign Out</button>
              </div>
            </>
          )}
        </div>
      </div>
      <main className="p-4 max-w-2xl mx-auto">{children}</main>
    </div>
  );
}
