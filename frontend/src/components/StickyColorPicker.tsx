import { STICKY_COLORS } from '../lib/constants';

type Props = {
  color: string;
  onPick: (color: string) => void;
};

export default function StickyColorPicker({ color, onPick }: Props) {
  return (
    <div className="absolute left-4 top-16 z-10 flex gap-1.5 rounded-lg bg-white p-2 shadow-md">
      {STICKY_COLORS.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={`Sticky color ${swatch}`}
          onClick={() => onPick(swatch)}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            swatch === color ? 'border-neutral-900' : 'border-transparent'
          }`}
          style={{ backgroundColor: swatch }}
        />
      ))}
    </div>
  );
}
