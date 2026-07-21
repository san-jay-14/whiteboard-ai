import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  | 'image'
  | 'sticky'
  | 'eraser';

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
  image: (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </Icon>
  ),
  eraser: (
    <Icon>
      <path d="M7 21h10M5 13l6-6 7 7-5 5H9l-4-4z" />
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
  { id: 'image', label: 'Insert image (9)', badge: '9' },
  { id: 'sticky', label: 'Sticky note (S)' },
  { id: 'eraser', label: 'Eraser (E or 0)', badge: '0' },
];

// Quick-fill suggestions for the Ask AI prompt, so users don't have to think
// up phrasing. Picking one drops the text into the box (still editable).
const AI_PRESETS = [
  'Optimize this diagram',
  'Redraw it neatly',
  'Add any missing connections',
  'Group related shapes',
];

// The "Ask AI" control: an on/off toggle plus a button that opens a small
// popover for an optional free-text instruction ("optimize this diagram",
// "redraw it neatly", …). Sending with an empty box runs a plain review.
function AiControls({
  enabled,
  onAsk,
  onToggle,
}: {
  enabled: boolean;
  onAsk: (prompt?: string) => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the popover is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function send(text?: string) {
    onAsk(text);
    setPrompt('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        type="button"
        title={enabled ? 'AI assistant is on — click to turn off' : 'AI assistant is off — click to turn on'}
        aria-label="Toggle AI assistant"
        aria-pressed={enabled}
        onClick={onToggle}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          enabled
            ? 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/15'
            : 'text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-700'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v8" />
          <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
          {!enabled && <path d="M4 4l16 16" />}
        </svg>
      </button>
      <button
        type="button"
        title={enabled ? 'Ask AI to review or act on the board' : 'Turn the AI assistant on to use this'}
        disabled={!enabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-300 dark:hover:bg-violet-500/15"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
        Ask AI
      </button>

      {open && enabled && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
          <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Tell the AI what to do (optional)
          </p>
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(prompt || undefined);
              }
            }}
            rows={2}
            placeholder="e.g. Optimize this diagram"
            className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-800 outline-none focus:border-violet-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {AI_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-violet-100 hover:text-violet-700 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-violet-500/25 dark:hover:text-violet-200"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => send(undefined)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Just review
            </button>
            <button
              type="button"
              onClick={() => send(prompt || undefined)}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
            >
              {prompt.trim() ? 'Send' : 'Review board'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  tool: Tool;
  onChange: (tool: Tool) => void;
  onAskAi: (prompt?: string) => void;
  aiEnabled: boolean;
  onToggleAi: () => void;
};

export default function Toolbar({ tool, onChange, onAskAi, aiEnabled, onToggleAi }: Props) {
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
      <AiControls enabled={aiEnabled} onAsk={onAskAi} onToggle={onToggleAi} />
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
