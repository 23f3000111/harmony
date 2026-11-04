import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, EDITION_INFO, EDITIONS, type Edition, type ShelfItem } from '@harmony/shared';
import { Logo } from '@/art/Illustrations';
import { LivingShelf } from '@/art/Shelf';
import { EASE } from '@/lib/motion';
import { STATIC_DEMO } from '@/lib/platform';

const SHOWCASE: Record<Edition, ShelfItem[]> = {
  home: [
    { id: 'h1', name: 'Rice', level: 0.35, status: 'soon', quantity: 3.5, unit: 'kg' },
    { id: 'h2', name: 'Eggs', level: 0.3, status: 'low', quantity: 9, unit: 'pcs' },
    { id: 'h3', name: 'Coffee', level: 0.7, status: 'ok', quantity: 2, unit: 'pack' },
    { id: 'h4', name: 'Milk', level: 0.33, status: 'low', quantity: 2, unit: 'carton' },
    { id: 'h5', name: 'Sambal', level: 0.66, status: 'ok', quantity: 2, unit: 'jar' },
  ],
  people: [
    { id: 'p1', name: 'Coffee beans', level: 0.24, status: 'low', quantity: 1.2, unit: 'kg' },
    { id: 'p2', name: 'Tea', level: 1, status: 'ok', quantity: 4, unit: 'box' },
    { id: 'p3', name: 'Oat milk', level: 0.16, status: 'low', quantity: 1, unit: 'carton' },
    { id: 'p4', name: 'Cups', level: 0.3, status: 'soon', quantity: 3, unit: 'sleeve' },
    { id: 'p5', name: 'Soap', level: 0.75, status: 'ok', quantity: 3, unit: 'refill' },
  ],
  supply: [
    { id: 's1', name: 'Boxes', level: 0.28, status: 'soon', quantity: 14, unit: 'bundle' },
    { id: 's2', name: 'Liners', level: 0.25, status: 'low', quantity: 6, unit: 'roll' },
    { id: 's3', name: 'Gloves', level: 0.27, status: 'low', quantity: 16, unit: 'box' },
    { id: 's4', name: 'Tape', level: 0.75, status: 'ok', quantity: 3, unit: 'carton' },
    { id: 's5', name: 'Sanitiser', level: 0.62, status: 'ok', quantity: 5, unit: 'can' },
  ],
};

/** Sign-in screens: the form on one side, the three editions taking turns on the other. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const edition = EDITIONS[index]!;

  useEffect(() => {
    document.documentElement.dataset.edition = 'supply';
    if (reduced) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % EDITIONS.length), 5200);
    return () => window.clearInterval(timer);
  }, [reduced]);

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="wash" aria-hidden />
      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 self-start">
          <Logo size={36} />
          <span className="text-[17px] font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
        <p className="hint text-center">{BRAND.tagline}</p>
      </main>

      <aside className="sticky top-0 hidden h-dvh p-4 lg:block" aria-hidden>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={edition}
            data-edition={edition}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="bg-hero grain absolute inset-4 flex flex-col justify-between overflow-hidden rounded-banner p-12 text-white"
          >
            <span className="absolute -right-24 -top-24 size-[420px] animate-drift rounded-full bg-[rgb(var(--brand-400)/.5)] blur-[100px]" />
            <span className="absolute -bottom-28 -left-16 size-[380px] rounded-full bg-[rgb(var(--accent)/.5)] blur-[100px]" />
            <div className="relative">
              <span className="inline-flex rounded-full border border-white/25 bg-white/12 px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur">{EDITION_INFO[edition].audience}</span>
              <h2 className="banner-title mt-6 max-w-[16ch]">{EDITION_INFO[edition].promise}</h2>
            </div>
            <div className="relative">
              <div className="rounded-[28px] border border-white/25 bg-white/10 px-6 pb-6 pt-8 backdrop-blur-md">
                <LivingShelf items={SHOWCASE[edition]} edition={edition} label="" />
              </div>
              <div className="mt-6 flex items-center justify-between">
                <p className="text-[15px] font-semibold">{EDITION_INFO[edition].name}</p>
                <div className="flex gap-1.5">
                  {EDITIONS.map((item, dot) => (
                    <span key={item} className={`h-1.5 rounded-full transition-all duration-500 ${dot === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  );
}

export function GoogleButton({ next, label = 'Continue with Google' }: { next?: string | null; label?: string }) {
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  const className = 'flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white text-[15px] font-semibold text-ink shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card';
  // The browser-only demo can't complete Google's sign-in, so it goes straight to the labelled stand-in.
  if (STATIC_DEMO) {
    return (
      <Link to={`/auth/google-demo${query}`} className={className}>
        <GoogleMark />
        {label}
      </Link>
    );
  }
  return (
    <a href={`/api/auth/google${query}`} className={className}>
      <GoogleMark />
      {label}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Divider({ text = 'or' }: { text?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[12.5px] text-ink-soft">
      <span className="h-px flex-1 bg-line" />
      {text}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
