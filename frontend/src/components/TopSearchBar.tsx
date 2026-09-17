import { useState, useEffect } from "react";
import { FilterIcon, RefreshIcon, SearchIcon } from "./Icons";

interface TopSearchBarProps {
  onSearch?: (query: string) => void;
  onRefresh?: () => void;
  placeholder?: string;
  loading?: boolean;
}

export default function TopSearchBar({
  onSearch,
  onRefresh,
  placeholder = "Search",
  loading = false,
}: TopSearchBarProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch) onSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <div className="w-full flex items-center justify-between gap-4 py-4 px-6 bg-white border-b border-gray-100">
      <div className="flex-1 max-w-xl relative flex items-center">
        <div className="absolute left-4 text-gray-400 pointer-events-none">
          <SearchIcon className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-10 py-2.5 bg-gray-100/70 border border-gray-200/80 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-gray-500">
        <button
          type="button"
          title="Filter"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-500"
        >
          <FilterIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-500 disabled:opacity-50"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}
