type Props = {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomToFit: () => void;
};

// Bottom-left zoom island, mirroring Excalidraw: [−] [NN%] [+]. Clicking the
// percentage resets to 100%; a separate "fit" button frames all content.
export default function ZoomControls({ scale, onZoomIn, onZoomOut, onReset, onZoomToFit }: Props) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1">
      <div className="flex items-center overflow-hidden rounded-lg bg-white shadow-md dark:bg-neutral-800">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={onZoomOut}
          className="px-3 py-1.5 text-lg leading-none text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom to 100%"
          onClick={onReset}
          className="min-w-14 px-1 py-1.5 text-center text-xs font-medium tabular-nums text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={onZoomIn}
          className="px-3 py-1.5 text-lg leading-none text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          +
        </button>
      </div>
      <button
        type="button"
        aria-label="Zoom to fit"
        title="Zoom to fit"
        onClick={onZoomToFit}
        className="rounded-lg bg-white p-2 text-neutral-700 shadow-md transition-colors hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  );
}
