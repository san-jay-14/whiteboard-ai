import type { ReactNode } from 'react';
import {
  BACKGROUND_COLORS,
  FONT_SIZES,
  STROKE_COLORS,
  STROKE_WIDTHS,
  type ItemStyle,
} from '../lib/itemStyle';
import { STICKY_COLORS } from '../lib/constants';
import type { Edges, FontFamily, StrokeStyle, TextAlign } from '../lib/types';

type Props = {
  style: ItemStyle;
  onChange: (patch: Partial<ItemStyle>) => void;
  showStroke: boolean;
  showBackground: boolean;
  showStrokeWidth: boolean;
  showEdges: boolean;
  showFont: boolean;
  stickyMode: boolean;
  hasSelection: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (action: 'back' | 'backward' | 'forward' | 'front') => void;
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

function Swatches({
  colors,
  value,
  onPick,
}: {
  colors: readonly string[];
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {colors.map((c) => {
        const transparent = c === 'transparent';
        return (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => onPick(c)}
            className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
              value === c ? 'ring-2 ring-violet-500 ring-offset-1' : 'border-black/10'
            }`}
            style={
              transparent
                ? {
                    backgroundImage:
                      'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0,4px 4px',
                  }
                : { backgroundColor: c }
            }
          />
        );
      })}
      <span className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-600" />
      <label
        className="h-6 w-6 cursor-pointer rounded-md border border-black/10"
        style={{ backgroundColor: value === 'transparent' ? '#fff' : value }}
        title="Custom color"
      >
        <input
          type="color"
          value={value === 'transparent' ? '#ffffff' : value}
          onChange={(e) => onPick(e.target.value)}
          className="h-0 w-0 opacity-0"
        />
      </label>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { id: T; label: string; render: ReactNode }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-label={o.label}
          title={o.label}
          onClick={() => onPick(o.id)}
          className={`flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors ${
            value === o.id
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700'
          }`}
        >
          {o.render}
        </button>
      ))}
    </div>
  );
}

export default function PropertiesPanel({
  style,
  onChange,
  showStroke,
  showBackground,
  showStrokeWidth,
  showEdges,
  showFont,
  stickyMode,
  hasSelection,
  onDuplicate,
  onDelete,
  onLayer,
}: Props) {
  return (
    <div className="absolute left-4 top-20 z-10 flex w-56 flex-col gap-3.5 rounded-xl bg-white p-3 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
      {showStroke && (
        <Section label="Stroke">
          <Swatches colors={STROKE_COLORS} value={style.strokeColor} onPick={(c) => onChange({ strokeColor: c })} />
        </Section>
      )}

      {showBackground && (
        <Section label="Background">
          <Swatches
            colors={stickyMode ? STICKY_COLORS : BACKGROUND_COLORS}
            value={style.backgroundColor}
            onPick={(c) => onChange({ backgroundColor: c })}
          />
        </Section>
      )}

      {showStrokeWidth && (
        <Section label="Stroke width">
          <Segmented<string>
            value={String(style.strokeWidth)}
            onPick={(v) => onChange({ strokeWidth: Number(v) })}
            options={STROKE_WIDTHS.map((w) => ({
              id: String(w),
              label: `${w}px`,
              render: <span className="w-4 rounded-full bg-current" style={{ height: Math.max(1, w) }} />,
            }))}
          />
        </Section>
      )}

      {showStroke && (
        <Section label="Stroke style">
          <Segmented<StrokeStyle>
            value={style.strokeStyle}
            onPick={(v) => onChange({ strokeStyle: v })}
            options={[
              { id: 'solid', label: 'Solid', render: <span className="w-4 border-t-2 border-current" /> },
              { id: 'dashed', label: 'Dashed', render: <span className="w-4 border-t-2 border-dashed border-current" /> },
              { id: 'dotted', label: 'Dotted', render: <span className="w-4 border-t-2 border-dotted border-current" /> },
            ]}
          />
        </Section>
      )}

      {showEdges && (
        <Section label="Edges">
          <Segmented<Edges>
            value={style.edges}
            onPick={(v) => onChange({ edges: v })}
            options={[
              { id: 'sharp', label: 'Sharp', render: <span className="h-3.5 w-3.5 border-2 border-current" /> },
              { id: 'round', label: 'Round', render: <span className="h-3.5 w-3.5 rounded border-2 border-current" /> },
            ]}
          />
        </Section>
      )}

      {showFont && (
        <>
          <Section label="Font size">
            <Segmented<string>
              value={String(style.fontSize)}
              onPick={(v) => onChange({ fontSize: Number(v) })}
              options={FONT_SIZES.map((s, i) => ({
                id: String(s),
                label: `${s}px`,
                render: <span style={{ fontSize: 11 + i * 2 }}>A</span>,
              }))}
            />
          </Section>
          <Section label="Font">
            <Segmented<FontFamily>
              value={style.fontFamily}
              onPick={(v) => onChange({ fontFamily: v })}
              options={[
                { id: 'hand', label: 'Hand-drawn', render: <span style={{ fontFamily: 'cursive' }}>A</span> },
                { id: 'normal', label: 'Normal', render: <span style={{ fontFamily: 'sans-serif' }}>A</span> },
                { id: 'code', label: 'Code', render: <span style={{ fontFamily: 'monospace' }}>A</span> },
              ]}
            />
          </Section>
          <Section label="Align">
            <Segmented<TextAlign>
              value={style.textAlign}
              onPick={(v) => onChange({ textAlign: v })}
              options={[
                { id: 'left', label: 'Left', render: <AlignIcon dir="left" /> },
                { id: 'center', label: 'Center', render: <AlignIcon dir="center" /> },
                { id: 'right', label: 'Right', render: <AlignIcon dir="right" /> },
              ]}
            />
          </Section>
        </>
      )}

      <Section label="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={style.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full accent-violet-600"
        />
      </Section>

      {hasSelection && (
        <>
          <Section label="Layers">
            <div className="flex items-center gap-1">
              <LayerButton label="Send to back" onClick={() => onLayer('back')} d="M4 4h10v10H4z M8 8h12v12H8z" />
              <LayerButton label="Send backward" onClick={() => onLayer('backward')} d="M4 4h12v12H4z" />
              <LayerButton label="Bring forward" onClick={() => onLayer('forward')} d="M8 8h12v12H8z" />
              <LayerButton label="Bring to front" onClick={() => onLayer('front')} d="M8 8h12v12H8z M4 4h10v10H4z" />
            </div>
          </Section>
          <Section label="Actions">
            <div className="flex items-center gap-1">
              <ActionButton label="Duplicate" onClick={onDuplicate} d="M9 9h11v11H9z M5 5h11v2H7v9H5z" />
              <ActionButton label="Delete" onClick={onDelete} d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" danger />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function AlignIcon({ dir }: { dir: 'left' | 'center' | 'right' }) {
  const x = dir === 'left' ? 4 : dir === 'center' ? 7 : 10;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 6h16" />
      <path d={`M${x} 12h${dir === 'center' ? 10 : 10}`} />
      <path d="M4 18h16" />
    </svg>
  );
}

function LayerButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d={d} />
      </svg>
    </button>
  );
}

function ActionButton({ label, onClick, d, danger }: { label: string; onClick: () => void; d: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        danger
          ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15'
          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </button>
  );
}
