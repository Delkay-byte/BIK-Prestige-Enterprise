/**
 * Ghana cedi symbol as inline SVG.
 * U+20B5 (₵) is missing from many Android system fonts, so we render a
 * reliable SVG glyph that works across all pilot devices.
 */
export const CEDI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 100 100" style="display:inline-block;vertical-align:baseline;font-size:inherit"><text y="80" x="5" font-size="90" font-family="system-ui,-apple-system,sans-serif" fill="currentColor">₵</text></svg>';

/**
 * Format a number with thousands separators and 2 decimal places.
 * Handles negatives consistently: -GH₵ 3,700.00
 * Used internally by formatCedi/formatCediHtml.
 */
function formatAmount(num: number): string {
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-GH₵ ${formatted}` : `GH₵ ${formatted}`;
}

// Format Ghanaian Cedi currency — returns plain text with the cedi character.
// For HTML rendering, use formatCediHtml() instead.
export function formatCedi(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "GH₵ 0.00";
  return formatAmount(num);
}

/**
 * Format Ghanaian Cedi currency for HTML rendering.
 * Works identically to formatCedi — the .cedi CSS class in CediAmount
 * handles Android font fallback.
 */
export function formatCediHtml(amount: number | string): string {
  return formatCedi(amount);
}

// Format date for display
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Format datetime for display
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Get today's date as YYYY-MM-DD
export function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Get greeting based on time of day (uses Ghana/business timezone)
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ── Business quotes ───────────────────────────────────────────────────────
const QUOTES: Record<string, string[]> = {
  momo: [
    "Accuracy builds trust.",
    "Every record tells part of the business story.",
    "Good service brings customers back.",
    "Small steps every day build great results.",
    "A well-kept account protects the business.",
    "Discipline with numbers leads to growth.",
    "Every transaction is a step forward.",
  ],
  susu: [
    "Trust is built one transaction at a time.",
    "Savings today, security tomorrow.",
    "Consistency is the key to strong savings.",
    "Every collection strengthens the community.",
    "Good relationships bring good business.",
    "Small savings grow into big results.",
    "Reliability builds lasting partnerships.",
  ],
  admin: [
    "Good leadership starts with accurate records.",
    "Accountability drives the business forward.",
    "Every detail matters when you manage people's trust.",
    "Growth follows good governance.",
    "A clear view of the numbers makes better decisions.",
    "Strong teams build strong businesses.",
    "Transparency is the foundation of trust.",
  ],
};

/**
 * Select a daily quote. Uses the day-of-year as a stable seed so the same
 * quote shows all day (no hydration mismatch). Different modules get
 * different quote pools.
 */
export function getDailyQuote(module: "momo" | "susu" | "admin" = "momo"): string {
  const pool = QUOTES[module] || QUOTES.momo;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return pool[dayOfYear % pool.length];
}

// Status badge color classes
export function getStatusColor(status: string): string {
  switch (status) {
    case "active":
    case "submitted":
    case "balanced":
      return "badge-green";
    case "inactive":
    case "discrepancy":
      return "badge-red";
    case "draft":
    case "pending":
      return "badge-yellow";
    case "reviewed":
      return "badge-blue";
    default:
      return "badge-gray";
  }
}
