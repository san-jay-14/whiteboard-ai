import { useEffect, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

type Status = 'thinking' | 'drawing';

// Rotating status verbs per phase, so a long pass doesn't sit on one word.
const WORDS: Record<Status, string[]> = {
  thinking: ['Thinking', 'Reasoning', 'Analyzing', 'Considering'],
  drawing: ['Drawing', 'Sketching', 'Laying it out', 'Adding shapes'],
};

// Floating "the AI is working" indicator, shown while the agent broadcasts a
// transient presence status (see ai-agent trackStatus). A dotLottie loader
// plays beside a verb that cycles every ~1.6s.
export default function AgentThinkingIndicator({ status }: { status: Status | null }) {
  const [wordIndex, setWordIndex] = useState(0);

  // Reset to the first verb whenever the phase changes.
  useEffect(() => {
    setWordIndex(0);
  }, [status]);

  // Cycle verbs while active.
  useEffect(() => {
    if (!status) return;
    const words = WORDS[status];
    const id = setInterval(() => setWordIndex((i) => (i + 1) % words.length), 1600);
    return () => clearInterval(id);
  }, [status]);

  if (!status) return null;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-1.5 rounded-full bg-white/95 py-1.5 pl-1.5 pr-4 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-neutral-800/95 dark:ring-white/10">
        <DotLottieReact
          src="/loading.lottie"
          autoplay
          loop
          style={{ width: 34, height: 34 }}
        />
        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
          {WORDS[status][wordIndex]}
          <span className="animate-pulse">…</span>
        </span>
      </div>
    </div>
  );
}
