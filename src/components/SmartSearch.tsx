"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchOption {
  id: string;
  label: string;
  subLabel?: string;
}

interface SmartSearchProps {
  label: string;
  placeholder?: string;
  searchFn: (query: string) => Promise<SearchOption[]>;
  onSelect: (option: SearchOption) => void;
  onClear?: () => void;
  selectedOption?: SearchOption | null;
  minQueryLength?: number;
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
}

export default function SmartSearch({
  label,
  placeholder = "Search...",
  searchFn,
  onSelect,
  onClear,
  selectedOption,
  minQueryLength = 2,
  debounceMs = 200,
  className = "",
  disabled = false,
}: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchOption[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Tracks whether the user is actively editing the input after a selection.
  // When true, the input shows the typed query instead of the selected label.
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < minQueryLength) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchFn(q);
        setResults(data);
        setHighlightedIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchFn, minQueryLength]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search, debounceMs]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        onSelect(results[highlightedIndex]);
        setQuery(results[highlightedIndex].label);
        setIsEditing(false);
        setShowResults(false);
      }
    } else if (event.key === "Escape") {
      setShowResults(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    setIsEditing(true);
    setShowResults(true);
    // Only clear selection when the input is explicitly emptied.
    // Typing a different search query updates results but preserves the
    // current selection until the user explicitly replaces it.
    if (selectedOption && value === "") {
      onClear?.();
    }
  };

  const handleOptionClick = (option: SearchOption) => {
    onSelect(option);
    setQuery(option.label);
    setIsEditing(false);
    setShowResults(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (query.length >= minQueryLength) {
      setShowResults(true);
    }
  };

  const displayValue = isEditing || !selectedOption ? query : selectedOption.label;

  return (
    <div className={`relative ${className}`}>
      <label className="form-label">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="spinner" style={{ width: 16, height: 16 }} />
          </div>
        )}
      </div>
      {showResults && (results.length > 0 || loading) && (
        <div
          ref={resultsRef}
          className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {results.map((option, index) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionClick(option)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                index === highlightedIndex
                  ? "bg-green-50 text-green-800"
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="font-medium">{option.label}</div>
              {option.subLabel && (
                <div className="text-xs text-gray-500">{option.subLabel}</div>
              )}
            </button>
          ))}
          {results.length === 0 && !loading && (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}