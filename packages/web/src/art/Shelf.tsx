import clsx from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import type { Edition, ShelfItem } from '@harmony/shared';
import { qty } from '@/lib/format';
import { EASE } from '@/lib/motion';

const FILL: Record<ShelfItem['status'], string> = {
  ok: '#ffffff',
  soon: '#ffd166',
  low: '#ff9aa8',
  out: '#ff9aa8',
};

const SHAPES: Record<Edition, { body: string; lid: string; width: number; height: number; top: number }[]> = {
  // Jars with lids for a pantry.
  home: [
    { body: 'M8 18 Q8 12 14 12 H34 Q40 12 40 18 V66 Q40 74 32 74 H16 Q8 74 8 66 Z', lid: 'M10 4 H38 Q40 4 40 6 V12 H8 V6 Q8 4 10 4 Z', width: 48, height: 78, top: 14 },
    { body: 'M6 22 Q6 14 14 14 H38 Q46 14 46 22 V68 Q46 76 38 76 H14 Q6 76 6 68 Z', lid: 'M12 6 H40 Q42 6 42 8 V14 H10 V8 Q10 6 12 6 Z', width: 52, height: 80, top: 16 },
  ],
  // Coffee canisters and paper-towel style rolls for an office pantry.
  people: [
    { body: 'M8 14 H40 V70 Q40 76 34 76 H14 Q8 76 8 70 Z', lid: 'M6 6 H42 Q44 6 44 8 V14 H4 V8 Q4 6 6 6 Z', width: 48, height: 80, top: 14 },
    { body: 'M10 10 Q24 4 38 10 V72 Q24 78 10 72 Z', lid: 'M10 10 Q24 4 38 10 Q24 16 10 10 Z', width: 48, height: 80, top: 12 },
  ],
  // Crates and drums for a stores team.
  supply: [
    { body: 'M4 16 H48 V72 Q48 76 44 76 H8 Q4 76 4 72 Z', lid: 'M2 8 H50 V16 H2 Z', width: 52, height: 80, top: 16 },
    { body: 'M8 12 Q26 6 44 12 V70 Q26 78 8 70 Z', lid: 'M8 12 Q26 6 44 12 Q26 18 8 12 Z', width: 52, height: 80, top: 13 },
  ],
};

/**
 * The signature piece: real stock drawn as containers on a shelf, each filled to its level.
 * Low items glow warm; the liquid line ripples so the shelf feels alive.
 */
export function LivingShelf({ items, edition, max = 8, label }: { items: ShelfItem[]; edition: Edition; max?: number; label: string }) {
  const reduced = useReducedMotion();
  // The banner renders one shelf for phones and one for desktop, so clip paths need ids unique to each.
  const instance = useId().replace(/:/g, '');
  const shown = items.slice(0, max);
  const shapes = SHAPES[edition];

  if (shown.length === 0) return null;

  return (
    <figure aria-label={label} className="relative w-full select-none">
      <ul className="flex items-end justify-center gap-1 px-1 sm:gap-2">
        {shown.map((item, index) => {
          const shape = shapes[index % shapes.length]!;
          const innerTop = shape.top;
          const innerHeight = shape.height - innerTop - 4;
          const fillHeight = Math.max(0, item.level) * innerHeight;
          const clipId = `shelf-${instance}-${item.id}`;
          const warn = item.status === 'low' || item.status === 'out';
          return (
            <motion.li
              key={item.id}
              className="group relative flex w-[54px] shrink-0 flex-col items-center sm:w-[62px]"
              initial={reduced ? false : { opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 + index * 0.07, ease: EASE }}
            >
              <span className="sr-only">
                {item.name}: {qty(item.quantity)} {item.unit}
                {warn ? ', running low' : ''}
              </span>
              <svg viewBox={`0 0 ${shape.width} ${shape.height}`} className={clsx('h-[64px] w-auto overflow-visible drop-shadow-[0_10px_14px_rgba(0,0,0,.18)] transition-transform duration-300 group-hover:-translate-y-1.5 sm:h-[78px]')} aria-hidden>
                <defs>
                  <clipPath id={clipId}>
                    <path d={shape.body} />
                  </clipPath>
                </defs>
                <path d={shape.body} fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.55)" strokeWidth="1.6" />
                <g clipPath={`url(#${clipId})`}>
                  <motion.g initial={reduced ? false : { y: innerHeight }} animate={{ y: 0 }} transition={{ duration: 1.2, delay: 0.45 + index * 0.08, ease: EASE }}>
                    <rect x="0" y={shape.height - 4 - fillHeight} width={shape.width} height={fillHeight + 8} fill={FILL[item.status]} opacity={item.status === 'ok' ? 0.82 : 0.95} />
                    {fillHeight > 2 && !reduced && (
                      <g style={{ animation: `wave ${5 + (index % 3)}s linear infinite` }}>
                        <path
                          d={`M0 ${shape.height - 4 - fillHeight} q ${shape.width / 4} -4 ${shape.width / 2} 0 t ${shape.width / 2} 0 t ${shape.width / 2} 0 t ${shape.width / 2} 0 V ${shape.height} H0 Z`}
                          fill={FILL[item.status]}
                          opacity={0.55}
                        />
                      </g>
                    )}
                  </motion.g>
                  <rect x="0" y="0" width={shape.width * 0.22} height={shape.height} fill="rgba(255,255,255,.18)" transform={`translate(${shape.width * 0.18} 0)`} />
                </g>
                <path d={shape.lid} fill={warn ? '#ffe0e4' : 'rgba(255,255,255,.88)'} />
                {warn && !reduced && <circle cx={shape.width - 6} cy={6} r={4} fill="#f4506a" className="origin-center" style={{ animation: 'ring 1.8s cubic-bezier(.2,.7,.3,1) infinite', transformBox: 'fill-box' }} />}
                {warn && <circle cx={shape.width - 6} cy={6} r={4} fill="#f4506a" stroke="#fff" strokeWidth="1.5" />}
              </svg>
              <span className="mt-1.5 w-full truncate text-center text-[10.5px] font-medium text-white/85 sm:text-[11px]">{item.name}</span>
            </motion.li>
          );
        })}
      </ul>
      <div aria-hidden className="mx-auto mt-1 h-2.5 w-[96%] rounded-full bg-white/22 shadow-[0_8px_18px_-6px_rgba(0,0,0,.35)]" />
    </figure>
  );
}
