"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Small information tooltip/popover for field explanations.
 * Opens on click (not hover) for mobile compatibility.
 * Closes when clicking outside.
 */
export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="More information"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 text-xs font-bold leading-none ml-1 align-middle"
      >
        i
      </button>
      {open && (
        <div className="absolute z-50 left-0 mt-2 w-64 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-sm text-gray-700">
          {text}
          <div className="absolute -top-1.5 left-3 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45" />
        </div>
      )}
    </div>
  );
}
