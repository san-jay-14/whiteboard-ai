import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toggleTheme, useTheme } from '../lib/theme';

type Props = {
  onBack: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onCopyPng: () => void;
  onResetCanvas: () => void;
  canvasBg: string; // '' = follow theme
  onCanvasBg: (bg: string) => void;
};

// Canvas background presets (Excalidraw-style). '' means "follow the theme".
const BG_PRESETS = [
  { id: '', label: 'Default (theme)', color: 'var(--canvas-bg)' },
  { id: '#ffffff', label: 'White', color: '#ffffff' },
  { id: '#f8f9fa', label: 'Light gray', color: '#f8f9fa' },
  { id: '#fff9db', label: 'Cream', color: '#fff9db' },
  { id: '#121212', label: 'Black', color: '#121212' },
];

function Item({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
    >
      <span className="text-neutral-500 dark:text-neutral-400">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </button>
  );
}

function I({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Menu({
  onBack,
  onExportPng,
  onExportSvg,
  onCopyPng,
  onResetCanvas,
  canvasBg,
  onCanvasBg,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const close = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={ref} className="absolute left-4 top-4 z-20">
      <button
        type="button"
        aria-label="Menu"
        title="Menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-neutral-700 shadow-md transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 w-60 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
          <Item icon={<I d="M15 18l-6-6 6-6" />} label="Back to boards" onClick={close(onBack)} />
          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          <Item icon={<I d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />} label="Export as PNG" onClick={close(onExportPng)} />
          <Item icon={<I d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />} label="Export as SVG" onClick={close(onExportSvg)} />
          <Item icon={<I d="M9 9h11v11H9zM5 5h11v2H7v9H5z" />} label="Copy PNG to clipboard" onClick={close(onCopyPng)} />
          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          <Item
            icon={theme === 'dark' ? <I d="M12 3v2M12 19v2M5 12H3M21 12h-2" /> : <I d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
          <Item icon={<I d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" />} label="Reset the canvas" onClick={close(onResetCanvas)} />
          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          <div className="px-2.5 py-1.5">
            <div className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Canvas background</div>
            <div className="flex items-center gap-1.5">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.id || 'default'}
                  type="button"
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => onCanvasBg(p.id)}
                  className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
                    canvasBg === p.id ? 'ring-2 ring-violet-500 ring-offset-1' : 'border-black/10'
                  }`}
                  style={{ background: p.color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
