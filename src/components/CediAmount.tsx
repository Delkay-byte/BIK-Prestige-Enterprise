/**
 * CediAmount — renders a Ghana cedi currency value reliably on all devices.
 *
 * The cedi symbol (U+20B5) is missing from Roboto and many system fonts on
 * Android.  This component ensures Noto Sans (which includes the glyph) is
 * used for the currency symbol via the .cedi CSS class.
 *
 * Usage:
 *   <CediAmount amount={1500} />       → GH₵ 1,500.00
 *   <CediAmount amount={-200} />       → -GH₵ 200.00
 *   <CediAmount amount={1500} className="text-lg font-bold" />
 */
export default function CediAmount({
  amount,
  className = "",
  showSign = false,
}: {
  amount: number | string;
  className?: string;
  showSign?: boolean;
}) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = num.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sign = showSign && num > 0 ? "+" : "";

  return (
    <span className={`cedi ${className}`}>
      {sign}GH₵{formatted}
    </span>
  );
}
