export type Tool = 'select' | 'rect' | 'ellipse' | 'pen';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'pen', label: 'Pen' },
];

type Props = {
  tool: Tool;
  onChange: (tool: Tool) => void;
};

export default function Toolbar({ tool, onChange }: Props) {
  return (
    <div className="absolute left-4 top-4 z-10 flex gap-1 rounded-lg bg-white p-1 shadow-md">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tool === t.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          {t.label}
        </button>
      ))}
      <span className="ml-2 self-center pr-2 text-xs text-neutral-400">
        Double-click empty canvas for text · Delete/Backspace to remove selection
      </span>
    </div>
  );
}
