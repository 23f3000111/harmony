import type { Edition } from '@harmony/shared';

/** Original line illustrations, recoloured by the active theme. */
export function Illustration({ name, className }: { name: 'empty' | 'done' | 'plan' | 'welcome' | 'board'; className?: string }) {
  const brand = 'rgb(var(--brand-600))';
  const light = 'rgb(var(--brand-100))';
  const accent = 'rgb(var(--accent))';
  const common = { stroke: 'rgb(var(--ink))', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (name === 'done') {
    return (
      <svg viewBox="0 0 200 140" className={className} aria-hidden>
        <ellipse cx="100" cy="124" rx="70" ry="8" fill={light} />
        <rect x="56" y="22" width="88" height="100" rx="14" fill="#fff" {...common} />
        <path d="M74 52h52M74 70h40M74 88h46" fill="none" {...common} stroke={light} strokeWidth="6" />
        <circle cx="140" cy="34" r="22" fill={brand} />
        <path d="M130 34l7 7 13-14" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M40 40l6 6M160 96l8 3M34 92l7-3" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'plan') {
    return (
      <svg viewBox="0 0 200 140" className={className} aria-hidden>
        <ellipse cx="100" cy="126" rx="76" ry="8" fill={light} />
        <rect x="34" y="24" width="132" height="96" rx="16" fill="#fff" {...common} />
        <path d="M34 48h132" fill="none" {...common} />
        <path d="M62 16v16M138 16v16" fill="none" {...common} />
        {[0, 1, 2, 3].map((col) =>
          [0, 1].map((row) => <rect key={`${col}-${row}`} x={48 + col * 28} y={60 + row * 26} width="18" height="16" rx="5" fill={col === 2 && row === 0 ? brand : light} />),
        )}
        <circle cx="160" cy="104" r="18" fill={accent} />
        <path d="M160 96v9l6 4" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'board') {
    return (
      <svg viewBox="0 0 200 140" className={className} aria-hidden>
        <ellipse cx="100" cy="128" rx="60" ry="7" fill={light} />
        <rect x="46" y="14" width="108" height="106" rx="14" fill="#fff" {...common} />
        <rect x="58" y="28" width="84" height="20" rx="8" fill={brand} />
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect x="60" y={60 + row * 18} width="10" height="10" rx="3" fill={row === 0 ? '#12b886' : light} />
            <path d={`M78 ${65 + row * 18}h50`} stroke={light} strokeWidth="6" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden>
      <ellipse cx="100" cy="126" rx="72" ry="8" fill={light} />
      <path d="M52 120V64l48-36 48 36v56Z" fill="#fff" {...common} />
      <rect x="86" y="86" width="28" height="34" rx="6" fill={brand} />
      <rect x="62" y="74" width="16" height="16" rx="4" fill={light} />
      <rect x="122" y="74" width="16" height="16" rx="4" fill={light} />
      <circle cx="150" cy="38" r="12" fill={accent} />
      <path d="M40 54c6-8 14-8 20 0" fill="none" {...common} stroke={accent} />
    </svg>
  );
}

/** The mark: an H whose crossbar is a little shelf. */
export function Logo({ size = 36, edition }: { size?: number; edition?: Edition }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[30%] shadow-glow" style={{ width: size, height: size, backgroundImage: 'var(--gradient-brand)' }} data-edition={edition}>
      <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
        <path fill="#fff" d="M18 14a4 4 0 0 1 8 0v14h12V14a4 4 0 0 1 8 0v36a4 4 0 0 1-8 0V36H26v14a4 4 0 0 1-8 0Z" />
      </svg>
    </span>
  );
}
