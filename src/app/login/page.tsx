import { Suspense } from "react";
import UnifiedLoginClient from "./UnifiedLoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>}>
      <UnifiedLoginClient searchParams={searchParams} />
    </Suspense>
  );
}