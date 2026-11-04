import clsx from 'clsx';
import { ArrowRight, Boxes, CornerDownLeft, FileText, Inbox, ListChecks, ReceiptText, Search, Truck, UserRound, Wallet } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { SearchHit } from '@harmony/shared';
import { api } from '@/lib/api';
import { SPRING } from '@/lib/motion';
import { useWorkspace } from '@/lib/workspace';
import type { NavItem } from './nav';

const KIND_ICON: Record<SearchHit['kind'], typeof Search> = {
  task: ListChecks,
  item: Boxes,
  supplier: Truck,
  order: ReceiptText,
  request: Inbox,
  person: UserRound,
  bill: Wallet,
};

interface Row {
  key: string;
  label: string;
  detail?: string | null;
  icon: typeof Search;
  go: () => void;
  group: string;
}

/** Ctrl/Cmd K: jump anywhere, or find a record by name. */
export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const { path, id } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHits([]);
    setActive(0);
    const timer = window.setTimeout(() => input.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/w/${id}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((result) => setHits(result.hits))
        .catch(() => undefined);
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, id]);

  const rows = useMemo<Row[]>(() => {
    const term = query.trim().toLowerCase();
    const pages = items
      .filter((item) => !term || item.label.toLowerCase().includes(term))
      .map((item) => ({ key: `page-${item.to}`, label: item.label, icon: item.icon, group: 'Go to', go: () => navigate(path(item.to)) }));
    const found = hits.map((hit) => ({ key: `${hit.kind}-${hit.id}`, label: hit.title, detail: hit.detail, icon: KIND_ICON[hit.kind] ?? FileText, group: 'Records', go: () => navigate(path(hit.href)) }));
    return [...found, ...pages];
  }, [items, hits, query, navigate, path]);

  useEffect(() => setActive(0), [rows.length]);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    row.go();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(rows.length - 1, index + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(rows[active]);
    }
  };

  let lastGroup = '';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
          <motion.div aria-hidden className="absolute inset-0 bg-brand-950/40 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={SPRING}
            className="relative w-full max-w-[600px] overflow-hidden rounded-[26px] bg-white shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-line/70 px-5">
              <Search aria-hidden className="size-5 text-ink-soft" />
              <input
                ref={input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, stock, people, orders…"
                aria-label="Search"
                role="combobox"
                aria-expanded
                aria-controls="palette-results"
                aria-activedescendant={rows[active] ? `palette-${rows[active]!.key}` : undefined}
                className="h-16 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-soft/70"
              />
              <kbd className="rounded-md border border-line px-1.5 text-[11px] font-semibold text-ink-soft">Esc</kbd>
            </div>
            <ul id="palette-results" role="listbox" className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
              {rows.length === 0 && <li className="px-4 py-8 text-center text-ink-muted">Nothing matches “{query}”.</li>}
              {rows.map((row, index) => {
                const header = row.group !== lastGroup ? row.group : null;
                lastGroup = row.group;
                return (
                  <li key={row.key} role="presentation">
                    {header && <p className="px-3 pb-1 pt-2.5 text-[12px] font-semibold text-ink-soft">{header}</p>}
                    <button
                      id={`palette-${row.key}`}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(row)}
                      className={clsx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', index === active ? 'bg-brand-50' : '')}
                    >
                      <span className={clsx('tile size-9', index === active ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-muted')}>
                        <row.icon aria-hidden className="size-[17px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{row.label}</span>
                        {row.detail && <span className="block truncate text-[12.5px] text-ink-soft">{row.detail}</span>}
                      </span>
                      {index === active ? <CornerDownLeft aria-hidden className="size-4 text-brand-600" /> : <ArrowRight aria-hidden className="size-4 text-line" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
