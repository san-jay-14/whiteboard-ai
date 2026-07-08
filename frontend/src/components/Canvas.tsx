import { useEffect, useRef, useState } from 'react';
import { Ellipse, Layer, Line, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import { shapesMap } from '../lib/doc';
import { useShapes } from '../hooks/useShapes';
import { createEllipse, createRect, createStroke, createText } from '../lib/shapes';
import ShapeRenderer from './ShapeRenderer';
import Toolbar, { type Tool } from './Toolbar';

type Point = { x: number; y: number };

type Draft =
  | { kind: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'pen'; points: number[] };

const MIN_DRAG = 3;

export default function Canvas() {
  const shapes = useShapes();
  const stageRef = useRef<Konva.Stage>(null);
  const dragStart = useRef<Point | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        shapesMap.delete(selectedId);
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  function pointerPos(): Point | null {
    return stageRef.current?.getPointerPosition() ?? null;
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (tool === 'select') {
      if (clickedOnEmpty) setSelectedId(null);
      return;
    }
    const pos = pointerPos();
    if (!pos) return;
    if (tool === 'rect' || tool === 'ellipse') {
      dragStart.current = pos;
      setDraft({ kind: tool, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (tool === 'pen') {
      setDraft({ kind: 'pen', points: [pos.x, pos.y] });
    }
  }

  function handleMouseMove() {
    if (!draft) return;
    const pos = pointerPos();
    if (!pos) return;
    if (draft.kind === 'pen') {
      setDraft({ kind: 'pen', points: [...draft.points, pos.x, pos.y] });
      return;
    }
    const start = dragStart.current;
    if (!start) return;
    setDraft({
      kind: draft.kind,
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      width: Math.abs(pos.x - start.x),
      height: Math.abs(pos.y - start.y),
    });
  }

  function handleMouseUp() {
    if (!draft) return;
    if (draft.kind === 'rect' && draft.width > MIN_DRAG && draft.height > MIN_DRAG) {
      const shape = createRect(draft.x, draft.y, draft.width, draft.height);
      shapesMap.set(shape.id, shape);
    } else if (draft.kind === 'ellipse' && draft.width > MIN_DRAG && draft.height > MIN_DRAG) {
      const shape = createEllipse(
        draft.x + draft.width / 2,
        draft.y + draft.height / 2,
        draft.width / 2,
        draft.height / 2,
      );
      shapesMap.set(shape.id, shape);
    } else if (draft.kind === 'pen' && draft.points.length >= 4) {
      const xs = draft.points.filter((_, i) => i % 2 === 0);
      const ys = draft.points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const relativePoints = draft.points.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
      const shape = createStroke(minX, minY, relativePoints);
      shapesMap.set(shape.id, shape);
    }
    setDraft(null);
    dragStart.current = null;
  }

  function handleDblClick(e: Konva.KonvaEventObject<MouseEvent>) {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (!clickedOnEmpty) return;
    const pos = pointerPos();
    if (!pos) return;
    const text = window.prompt('Text:');
    if (!text || !text.trim()) return;
    const shape = createText(pos.x, pos.y, text.trim());
    shapesMap.set(shape.id, shape);
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-100">
      <Toolbar tool={tool} onChange={setTool} />
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDblClick}
      >
        <Layer>
          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              selected={shape.id === selectedId}
              draggable={tool === 'select'}
              onSelect={() => tool === 'select' && setSelectedId(shape.id)}
            />
          ))}

          {draft?.kind === 'rect' && (
            <Rect
              x={draft.x}
              y={draft.y}
              width={draft.width}
              height={draft.height}
              fill="rgba(56,189,248,0.3)"
              stroke="#0369a1"
              dash={[4, 4]}
              listening={false}
            />
          )}
          {draft?.kind === 'ellipse' && (
            <Ellipse
              x={draft.x + draft.width / 2}
              y={draft.y + draft.height / 2}
              radiusX={draft.width / 2}
              radiusY={draft.height / 2}
              fill="rgba(250,204,21,0.3)"
              stroke="#a16207"
              dash={[4, 4]}
              listening={false}
            />
          )}
          {draft?.kind === 'pen' && (
            <Line
              points={draft.points}
              stroke="#111827"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
