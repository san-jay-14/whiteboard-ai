import { useEffect, useRef, useState } from 'react';
import type { AiLogEntry } from '../lib/aiLog';

type Props = {
  entries: AiLogEntry[];
  enabled: boolean;
};

// A compact, collapsible transcript of the shared AI interaction log — the
// whiteboard has no chat panel, so this is where people can see the
// instructions given to the AI and the AI's plain-text responses. Read-only:
// instructions are sent via the "Ask AI" popover, and the agent writes both
// sides of the log. Hidden entirely until there's at least one entry.
export default function AiActivityPanel({ entries, enabled }: Props) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view when the log grows while open.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, open]);

  if (entries.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-20 w-72 max-w-[calc(100vw-2rem)]">
      {open && (
        <div className="mb-2 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">AI activity</span>
            {!enabled && (
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                off
              </span>
            )}
          </div>
          <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto px-3 py-2.5">
            {entries.map((e, i) => (
              <div key={i} className={e.role === 'user' ? 'text-right' : 'text-left'}>
                <span
                  className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                    e.role === 'user'
                      ? 'bg-violet-600 text-white'
                      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  {e.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-md transition-colors hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
        AI activity
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
          {entries.length}
        </span>
      </button>
    </div>
  );
}
