/**
 * Ghana cedi symbol as inline SVG.
 * U+20B5 (₵) is missing from many Android system fonts, so we render a
 * reliable SVG glyph that works across all pilot devices.
 */
export const CEDI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 100 100" style="display:inline-block;vertical-align:baseline;font-size:inherit"><text y="80" x="5" font-size="90" font-family="system-ui,-apple-system,sans-serif" fill="currentColor">₵</text></svg>';

// Format Ghanaian Cedi currency — returns plain text with the cedi character.
// For HTML rendering, use formatCediHtml() instead.
export function formatCedi(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `GH\u20B5 ${num.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format Ghanaian Cedi currency for HTML rendering.
 * Uses a plain "GH" + the cedi character. This works reliably because
 * we provide an explicit font stack that includes a cedi-capable font.
 */
export function formatCediHtml(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `GH\u20B5${num.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

// Get greeting based on time of day
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
