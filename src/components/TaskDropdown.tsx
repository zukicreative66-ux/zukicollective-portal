import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export type TaskOption = {
  id: string;
  label: string;
  detail?: string;
};

type TaskDropdownProps = {
  options: TaskOption[];
  selectedId?: string | null;
  onSelect: (option: TaskOption) => void;
  placeholder?: string;
};

export default function TaskDropdown({
  options,
  selectedId,
  onSelect,
  placeholder = 'Select a task',
}: TaskDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.id === selectedId) ?? null,
    [options, selectedId]
  );

  const filteredOptions = useMemo(() => {
    const rawQuery = query.trim().toLowerCase();
    if (!rawQuery) return options;

    return options.filter((option) => {
      const haystack = `${option.label} ${option.detail ?? ''}`.toLowerCase();
      return haystack.includes(rawQuery);
    });
  }, [options, query]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-brand-peach/20 bg-brand-brown/40 px-3 py-2.5 text-left text-sm text-brand-cream"
      >
        <span className="flex items-center gap-2">
          <Search size={14} className="text-brand-peach/60" />
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={14} className="text-brand-peach/60" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-brand-peach/20 bg-brand-brown-card p-2 shadow-xl">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks..."
            className="mb-2 w-full rounded-lg border border-brand-peach/10 bg-brand-brown/40 px-3 py-2 text-sm text-brand-cream outline-none"
          />

          <div className="max-h-56 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-brand-cream/60">No matching tasks</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelect(option);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                    selectedId === option.id
                      ? 'bg-brand-peach/15 text-brand-peach'
                      : 'text-brand-cream hover:bg-brand-peach/10'
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.detail && (
                    <span className="mt-0.5 text-xs text-brand-cream/60">{option.detail}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
