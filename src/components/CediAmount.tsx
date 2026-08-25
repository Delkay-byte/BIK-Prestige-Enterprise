/**
 * CediAmount — renders a Ghana cedi currency value reliably on ALL devices.
 *
 * The cedi symbol (U+20B5) is missing from Roboto and many system fonts on
 * Android. This component renders the ₵ glyph inside a small SVG text element,
 * which Android Chrome renders correctly even when CSS text doesn't.
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
  if (isNaN(num)) return <span className={className}>GH&#x20B5; 0.00</span>;

  const abs = Math.abs(num);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sign = num < 0 ? "-" : showSign && num > 0 ? "+" : "";

  return (
    <span className={className}>
      {sign}GH<CediMark />{formatted}
    </span>
  );
}

/**
 * Device-independent Ghana cedi symbol rendered as inline SVG.
 *
 * Android Chrome often fails to render U+20B5 (₵) in CSS text, showing a
 * box/tofu instead. SVG text rendering is more reliable because it uses
 * the browser's SVG text engine which has better Unicode coverage.
 *
 * The SVG uses the system font stack and renders the actual ₵ character.
 */
function CediMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0.78em"
      height="1em"
      viewBox="0 0 100 130"
      style={{
        display: "inline-block",
        verticalAlign: "-0.15em",
        marginInline: "0.02em",
      }}
      aria-label="cedi"
      role="img"
    >
      <text
        x="50"
        y="105"
        textAnchor="middle"
        fontSize="120"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Liberation Sans', sans-serif"
        fill="currentColor"
      >
        ₵
      </text>
    </svg>
  );
}
