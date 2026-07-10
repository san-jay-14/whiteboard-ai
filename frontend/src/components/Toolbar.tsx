import type { ReactNode } from 'react';
import { toggleTheme, useTheme } from '../lib/theme';

export type Tool =
  | 'hand'
  | 'select'
  | 'rect'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'pen'
  | 'text'
  | 'sticky';

// Shared stroke-icon wrapper — 20px, currentColor so active/inactive theming
// is just a text-color swap.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS: Record<Tool, ReactNode> = {
  hand: (
    <Icon>
      <path d="M18 11V6a1.5 1.5 0 0 0-3 0M15 6V4.5a1.5 1.5 0 0 0-3 0V6M12 6V5a1.5 1.5 0 0 0-3 0v7" />
      <path d="M9 12V8.5a1.5 1.5 0 0 0-3 0V14a6 6 0 0 0 6 6h1.5a5 5 0 0 0 5-5v-4" />
    </Icon>
  ),
  select: (
    <Icon>
      <path d="M5 3l14 7-6 2-2 6-6-15z" />
    </Icon>
  ),
  rect: (
    <Icon>
      <rect x="4" y="5" width="16" height="14" rx="2" />
    </Icon>
  ),
  diamond: (
    <Icon>
      <path d="M12 3l9 9-9 9-9-9 9-9z" />
    </Icon>
  ),
  ellipse: (
    <Icon>
      <circle cx="12" cy="12" r="8" />
    </Icon>
  ),
  arrow: (
    <Icon>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Icon>
  ),
  line: (
    <Icon>
      <path d="M4 18L20 6" />
    </Icon>
  ),
  pen: (
    <Icon>
      <path d="M4 20s2-1 4-3l8-8a2 2 0 0 0-3-3l-8 8c-2 2-3 4-3 4l2 2z" />
      <path d="M13 6l3 3" />
    </Icon>
  ),
  text: (
    <Icon>
      <path d="M6 5h12M12 5v14M9 19h6" />
    </Icon>
  ),
  sticky: (
    <Icon>
      <path d="M5 4h14v10l-5 5H5V4z" />
      <path d="M14 19v-5h5" />
    </Icon>
  ),
};

// Tool ordering + keyboard shortcuts, matching Excalidraw where possible.
const TOOLS: { id: Tool; label: string; badge?: string }[] = [
  { id: 'hand', label: 'Hand (H) — pan' },
  { id: 'select', label: 'Selection (V or 1)', badge: '1' },
  { id: 'rect', label: 'Rectangle (R or 2)', badge: '2' },
  { id: 'diamond', label: 'Diamond (D or 3)', badge: '3' },
  { id: 'ellipse', label: 'Ellipse (O or 4)', badge: '4' },
  { id: 'arrow', label: 'Arrow (A or 5)', badge: '5' },
  { id: 'line', label: 'Line (L or 6)', badge: '6' },
  { id: 'pen', label: 'Draw (P or 7)', badge: '7' },
  { id: 'text', label: 'Text (T or 8)', badge: '8' },
  { id: 'sticky', label: 'Sticky note (S)' },
];

type Props = {
  tool: Tool;
  onChange: (tool: Tool) => void;
  onAskAi: () => void;
};

export default function Toolbar({ tool, onChange, onAskAi }: Props) {
  const theme = useTheme();
  return (
    <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
      {TOOLS.map((t) => {
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            {ICONS[t.id]}
            {t.badge && (
              <span className="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-medium text-neutral-400 dark:text-neutral-500">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
      <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-600" />
      <button
        type="button"
        title="Ask AI to review the board"
        onClick={onAskAi}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/15"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
        Ask AI
      </button>
      <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-600" />
      <button
        type="button"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle theme"
        onClick={toggleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        )}
      </button>
    </div>
  );
}
