import { useEffect, useRef } from 'react';

type Props = {
  left: number;
  top: number;
  fontSize: number; // already scaled by the viewport zoom
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

// A transparent, borderless textarea overlaid on the canvas at the text's
// world position (mapped to screen px). It auto-sizes to its content and
// commits on blur; Escape cancels. Font size is passed pre-scaled so the
// caret and glyphs line up with the Konva text at any zoom.
export default function TextEditor({
  left,
  top,
  fontSize,
  fontFamily,
  color,
  align,
  value,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow to fit content in both dimensions (white-space: pre keeps
  // scrollWidth meaningful for the longest line).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.style.width = 'auto';
    el.style.width = `${Math.max(fontSize, el.scrollWidth + 2)}px`;
  }, [value, fontSize]);

  // Place the caret at the end when an existing text is opened for editing.
  useEffect(() => {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        // Enter inserts a newline (multi-line text); Esc/blur commits.
        e.stopPropagation();
      }}
      spellCheck={false}
      className="absolute z-30 m-0 resize-none overflow-hidden whitespace-pre border-none bg-transparent p-0 leading-tight outline-none"
      style={{ left, top, fontSize, fontFamily, color, textAlign: align }}
    />
  );
}
