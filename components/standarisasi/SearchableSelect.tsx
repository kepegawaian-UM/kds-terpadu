"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = { value: string; label: string; group?: string };

// Combobox teks-cari + dropdown, dipakai sebagai pengganti <select> polos utk daftar panjang
// (mis. 177 Unit Kerja) yang susah dicari dgn scroll native select.
export function SearchableSelect({
  name,
  options,
  defaultValue,
  placeholder,
  createLabel,
  onCreateOption,
}: {
  name: string;
  options: SearchableOption[];
  defaultValue?: string;
  placeholder: string;
  /** Kalau diisi, tampilkan tombol "Tambah ... sebagai <createLabel>" saat query tidak match apa pun. */
  createLabel?: string;
  onCreateOption?: (query: string) => Promise<SearchableOption>;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(options.find((o) => o.value === value)?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = useMemo(() => {
    const effectiveQuery = query === selectedLabel ? "" : query;
    const q = effectiveQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options, selectedLabel]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchableOption[]>();
    for (const o of filtered) {
      const g = o.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return map;
  }, [filtered]);

  function pick(o: SearchableOption) {
    setValue(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  const trimmedQuery = query.trim();
  const showCreateOption =
    !!onCreateOption &&
    !!trimmedQuery &&
    !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  async function handleCreate() {
    if (!onCreateOption) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateOption(trimmedQuery);
      pick(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Gagal menambah opsi baru.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.currentTarget.blur();
          } else if (e.key === "Enter" && open && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0]);
          }
        }}
        autoComplete="off"
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Tidak ada hasil.</p>}
          {[...groups.entries()].map(([group, opts]) => (
            <div key={group || "_"}>
              {group && (
                <p className="bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{group}</p>
              )}
              {opts.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                    o.value === value ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          {showCreateOption && (
            <button
              type="button"
              disabled={creating}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreate}
              className="block w-full border-t border-slate-200 px-3 py-2 text-left text-sm text-sidebar hover:bg-slate-50 disabled:opacity-50"
            >
              {creating ? "Menambah..." : `+ Tambah "${trimmedQuery}" sebagai ${createLabel ?? "opsi baru"}`}
            </button>
          )}
          {createError && <p className="border-t border-slate-200 px-3 py-2 text-xs text-red-600">{createError}</p>}
        </div>
      )}
    </div>
  );
}
