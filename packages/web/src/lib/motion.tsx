import { animate, motion, useReducedMotion, type Variants } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;
export const SOFT_SPRING = { type: 'spring', stiffness: 220, damping: 26 } as const;
export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Lifts into place the first time it scrolls into view. Stays visible if observers aren't available. */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' }) {
  const reduced = useReducedMotion();
  const Tag = as === 'section' ? motion.section : motion.div;
  if (reduced || typeof IntersectionObserver === 'undefined') {
    return as === 'section' ? <section className={className}>{children}</section> : <div className={className}>{children}</div>;
  }
  return (
    <Tag className={className} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.8, delay, ease: EASE }}>
      {children}
    </Tag>
  );
}

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Rolls a number up from zero when it first appears, and on to new values when data changes. */
export function CountUp({ value, format, className, duration = 1.1 }: { value: number; format?: (value: number) => string; className?: string; duration?: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const current = useRef(0);
  const render = useCallback((next: number) => (format ? format(next) : String(Math.round(next))), [format]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.textContent = render(value);
      current.current = value;
      return;
    }
    const run = () => {
      const controls = animate(current.current, value, {
        duration: started.current ? 0.6 : duration,
        ease: EASE,
        onUpdate: (latest) => {
          current.current = latest;
          node.textContent = render(latest);
        },
      });
      started.current = true;
      return controls;
    };
    if (started.current) {
      const controls = run();
      return () => controls.stop();
    }
    let controls: ReturnType<typeof animate> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          controls = run();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      controls?.stop();
    };
  }, [value, reduced, render, duration]);

  return (
    <span ref={ref} className={className}>
      {render(reduced ? value : 0)}
    </span>
  );
}

/** Mouse-only 3D tilt with a soft glare following the pointer. Off for touch and reduced motion. */
export function useTilt<T extends HTMLElement>(maxDegrees = 7) {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (reduced || event.pointerType !== 'mouse' || !ref.current) return;
      const node = ref.current;
      const { clientX, clientY } = event;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        node.style.setProperty('--ry', `${(x - 0.5) * maxDegrees * 2}deg`);
        node.style.setProperty('--rx', `${(0.5 - y) * maxDegrees * 2}deg`);
        node.style.setProperty('--gx', `${x * 100}%`);
        node.style.setProperty('--gy', `${y * 100}%`);
        node.style.setProperty('--glare', '1');
      });
    },
    [maxDegrees, reduced],
  );

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.style.setProperty('--glare', '0');
  }, []);

  const style: CSSProperties = {
    transform: 'perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
    transition: 'transform 180ms ease-out',
    transformStyle: 'preserve-3d',
  };

  return { ref, onPointerMove, onPointerLeave, style };
}

export function Glare() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-200"
      style={{
        opacity: 'var(--glare, 0)',
        mixBlendMode: 'soft-light',
        background: 'radial-gradient(420px circle at var(--gx, 50%) var(--gy, 50%), rgb(255 255 255 / .75), transparent 60%)',
      }}
    />
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** A small burst of confetti from a point on screen, kept for moments that deserve it. */
export function celebrate(origin: { x: number; y: number }, colors: string[] = ['#34d399', '#ffbe3d', '#5996fb', '#ff7a8a']) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden';
  document.body.appendChild(layer);
  const pieces = 26;
  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement('span');
    const size = 5 + Math.random() * 6;
    piece.style.cssText = `position:absolute;left:${origin.x}px;top:${origin.y}px;width:${size}px;height:${size * 0.6}px;border-radius:2px;background:${colors[index % colors.length]}`;
    layer.appendChild(piece);
    const angle = (Math.PI * 2 * index) / pieces + Math.random() * 0.4;
    const distance = 60 + Math.random() * 130;
    piece.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance + 90}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' },
    );
  }
  window.setTimeout(() => layer.remove(), 1500);
}
