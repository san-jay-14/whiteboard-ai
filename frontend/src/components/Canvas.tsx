import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Ellipse, Layer, Line, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import { useBoardSession } from '../lib/BoardSessionContext';
import { useShapes } from '../hooks/useShapes';
import { useAwareness } from '../hooks/useAwareness';
import { usePresence } from '../hooks/usePresence';
import { createEllipse, createRect, createStroke, createArrow, createSticky, createText } from '../lib/shapes';
import { deleteShapesCascading } from '../lib/deleteShapes';
import { acceptShape, rejectShape } from '../lib/reviewActions';
import { getRotatedAABB, getShapeAnchors, nearestAnchor, rectsIntersect, type Anchor } from '../lib/geometry';
import { STICKY_DEFAULT_SIZE } from '../lib/constants';
import type { Shape, StickyShape } from '../lib/types';
import ShapeRenderer from './ShapeRenderer';
import SelectionTransformer from './SelectionTransformer';
import CursorLayer from './CursorLayer';
import PeerList from './PeerList';
import PendingReviewControls from './PendingReviewControls';
import ReviewTooltip from './ReviewTooltip';
import StickyColorPicker from './StickyColorPicker';
import Toolbar, { type Tool } from './Toolbar';

const GROUP_BOX_COLOR = '#7c3aed';
const GROUP_BOX_PADDING = 10;

type Point = { x: number; y: number };

type Draft =
  | { kind: 'rect' | 'ellipse' | 'marquee'; x: number; y: number; width: number; height: number }
  | { kind: 'pen'; points: number[] };

type ArrowDraft = {
  fromId: string;
  fromPoint: Anchor;
  toPoint: Anchor;
  toId: string | null;
};

const MIN_DRAG = 3;
const CURSOR_THROTTLE_MS = 50;
const TRANSFORMABLE_TYPES = new Set<Shape['type']>(['rect', 'ellipse', 'sticky']);

export default function Canvas() {
  const { doc, shapesMap, awareness, boardSync } = useBoardSession();
  const shapes = useShapes();
  const remotePeers = useAwareness();
  const presencePeers = usePresence();
  const stageRef = useRef<Konva.Stage>(null);
  const dragStart = useRef<Point | null>(null);
  const lastCursorSentAt = useRef(0);
  const shapeNodeRefs = useRef(new Map<string, Konva.Node>());
  // Tracks which shape's drag gesture is the one the user actually grabbed,
  // as opposed to a sibling Konva's Transformer is proxy-dragging alongside
  // it — only the genuine primary should trigger the multi-select sync.
  const primaryDragShapeId = useRef<string | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [hoveredPendingId, setHoveredPendingId] = useState<string | null>(null);

  const presentClientIDs = useMemo(
    () => new Set(presencePeers.map((peer) => peer.awarenessClientID)),
    [presencePeers],
  );

  const selectedShapes = useMemo(() => shapes.filter((s) => selectedIds.has(s.id)), [shapes, selectedIds]);
  const singleSelectedSticky =
    selectedShapes.length === 1 && selectedShapes[0].type === 'sticky' ? (selectedShapes[0] as StickyShape) : null;

  const transformableSelectedIds = useMemo(
    () => selectedShapes.filter((s) => TRANSFORMABLE_TYPES.has(s.type)).map((s) => s.id),
    [selectedShapes],
  );

  // step 11: accept/reject controls appear only for a single selected
  // pendingReview shape, mirroring the singleSelectedSticky pattern above.
  const singleSelectedPending =
    selectedShapes.length === 1 && selectedShapes[0].pendingReview ? selectedShapes[0] : null;

  const hoveredShape = hoveredPendingId ? shapes.find((s) => s.id === hoveredPendingId) : undefined;

  const pendingCount = useMemo(() => shapes.filter((s) => s.pendingReview).length, [shapes]);

  // One dashed box per groupId that still has at least one pendingReview
  // member — a propose_group proposal's shared visual indicator (brief
  // section 5). Union of each member's rotated AABB, padded.
  const pendingGroupBoxes = useMemo(() => {
    const byGroup = new Map<string, Shape[]>();
    for (const s of shapes) {
      if (s.pendingReview && s.groupId) {
        const members = byGroup.get(s.groupId) ?? [];
        members.push(s);
        byGroup.set(s.groupId, members);
      }
    }
    return Array.from(byGroup.entries()).map(([groupId, members]) => {
      const boxes = members.map((m) => getRotatedAABB(m));
      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.width));
      const maxY = Math.max(...boxes.map((b) => b.y + b.height));
      return {
        groupId,
        x: minX - GROUP_BOX_PADDING,
        y: minY - GROUP_BOX_PADDING,
        width: maxX - minX + GROUP_BOX_PADDING * 2,
        height: maxY - minY + GROUP_BOX_PADDING * 2,
      };
    });
  }, [shapes]);

  function handleHoverChange(id: string, hovering: boolean) {
    setHoveredPendingId((prev) => (hovering ? id : prev === id ? null : prev));
  }

  function handleAccept(shape: Shape) {
    acceptShape(shapesMap, shape);
    setSelectedIds(new Set());
  }

  function handleReject(shape: Shape) {
    rejectShape(shapesMap, shape);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingStickyId) return; // typing in the inline editor, not a canvas shortcut
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteShapesCascading(doc, shapesMap, Array.from(selectedIds));
        setSelectedIds(new Set());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, editingStickyId, doc, shapesMap]);

  function pointerPos(): Point | null {
    return stageRef.current?.getPointerPosition() ?? null;
  }

  function updateCursorAwareness(pos: Point | null) {
    const now = Date.now();
    if (now - lastCursorSentAt.current < CURSOR_THROTTLE_MS) return;
    lastCursorSentAt.current = now;
    awareness.setLocalStateField('cursor', pos);
  }

  const registerNode = useCallback(
    (id: string) => (node: Konva.Node | null) => {
      if (node) shapeNodeRefs.current.set(id, node);
      else shapeNodeRefs.current.delete(id);
    },
    [],
  );

  function resolveShapeId(node: Konva.Node | null): string | null {
    let current = node;
    while (current) {
      const id = current.id();
      if (id && shapesMap.has(id)) return id;
      current = current.getParent();
    }
    return null;
  }

  function findAttachableShapeIdUnderCursor(exclude: Set<string>): string | null {
    const stage = stageRef.current;
    const pos = pointerPos();
    if (!stage || !pos) return null;
    const node = stage.getIntersection(pos);
    const id = resolveShapeId(node);
    if (!id || exclude.has(id)) return null;
    const shape = shapesMap.get(id);
    if (!shape || shape.type === 'arrow') return null; // arrows can't attach to arrows
    return id;
  }

  function handleSelectShape(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    if (tool !== 'select') return;
    setSelectedIds((prev) => {
      if (e.evt.shiftKey) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const clickedOnEmpty = e.target === e.target.getStage();
    const pos = pointerPos();
    if (!pos) return;

    if (tool === 'select') {
      if (!clickedOnEmpty) return; // individual shape handlers manage selection/drag
      dragStart.current = pos;
      setDraft({ kind: 'marquee', x: pos.x, y: pos.y, width: 0, height: 0 });
      return;
    }

    if (tool === 'rect' || tool === 'ellipse') {
      dragStart.current = pos;
      setDraft({ kind: tool, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (tool === 'pen') {
      setDraft({ kind: 'pen', points: [pos.x, pos.y] });
    } else if (tool === 'arrow') {
      const fromId = findAttachableShapeIdUnderCursor(new Set());
      if (!fromId) return; // connectors must start on a shape
      const fromShape = shapesMap.get(fromId);
      if (!fromShape) return;
      const fromPoint = nearestAnchor(getShapeAnchors(fromShape), pos);
      setArrowDraft({ fromId, fromPoint, toPoint: pos, toId: null });
    } else if (tool === 'sticky') {
      const shape = createSticky(pos.x - STICKY_DEFAULT_SIZE / 2, pos.y - STICKY_DEFAULT_SIZE / 2);
      shapesMap.set(shape.id, shape);
      setSelectedIds(new Set([shape.id]));
      setTool('select');
    }
  }

  function handleMouseMove() {
    const pos = pointerPos();
    updateCursorAwareness(pos);
    if (!pos) return;

    if (draft) {
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
      return;
    }

    if (arrowDraft) {
      const targetId = findAttachableShapeIdUnderCursor(new Set([arrowDraft.fromId]));
      const targetShape = targetId ? shapesMap.get(targetId) : undefined;
      if (targetShape) {
        setArrowDraft({ ...arrowDraft, toPoint: nearestAnchor(getShapeAnchors(targetShape), pos), toId: targetId! });
      } else {
        setArrowDraft({ ...arrowDraft, toPoint: pos, toId: null });
      }
    }
  }

  function handleMouseLeave() {
    awareness.setLocalStateField('cursor', null);
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (draft) {
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
      } else if (draft.kind === 'marquee') {
        if (draft.width > MIN_DRAG || draft.height > MIN_DRAG) {
          const marqueeBounds = { x: draft.x, y: draft.y, width: draft.width, height: draft.height };
          const hits = shapes
            .filter((s) => s.type !== 'arrow' && rectsIntersect(marqueeBounds, getRotatedAABB(s)))
            .map((s) => s.id);
          setSelectedIds((prev) => {
            if (e.evt.shiftKey) return new Set([...prev, ...hits]);
            return new Set(hits);
          });
        } else if (!e.evt.shiftKey) {
          setSelectedIds(new Set());
        }
      }
      setDraft(null);
      dragStart.current = null;
      return;
    }

    if (arrowDraft) {
      if (arrowDraft.toId && arrowDraft.toId !== arrowDraft.fromId) {
        const fromShape = shapesMap.get(arrowDraft.fromId);
        const toShape = shapesMap.get(arrowDraft.toId);
        if (fromShape && toShape) {
          const shape = createArrow(fromShape, toShape);
          shapesMap.set(shape.id, shape);
        }
      }
      setArrowDraft(null);
    }
  }

  function handleDblClick(e: Konva.KonvaEventObject<MouseEvent>) {
    const clickedOnEmpty = e.target === e.target.getStage();
    const pos = pointerPos();
    if (clickedOnEmpty) {
      if (!pos) return;
      const text = window.prompt('Text:');
      if (!text || !text.trim()) return;
      const shape = createText(pos.x, pos.y, text.trim());
      shapesMap.set(shape.id, shape);
      return;
    }
    const id = resolveShapeId(e.target);
    const shape = id ? shapesMap.get(id) : undefined;
    if (shape?.type === 'sticky') {
      setEditingStickyId(shape.id);
      setEditingText(shape.text);
    }
  }

  function commitStickyEdit() {
    if (!editingStickyId) return;
    const shape = shapesMap.get(editingStickyId);
    if (shape && shape.type === 'sticky') {
      shapesMap.set(editingStickyId, { ...shape, text: editingText });
    }
    setEditingStickyId(null);
  }

  function handleShapeDragStart(id: string) {
    // First dragstart wins — Konva's Transformer proxy-drags other
    // attached nodes by calling their own startDrag(), which also fires
    // their dragstart, slightly after this one.
    if (primaryDragShapeId.current === null) {
      primaryDragShapeId.current = id;
    }
  }

  // Konva's Transformer already moves every OTHER transformable node it has
  // attached when one of them is dragged (see Transformer's _proxyDrag) —
  // each of those siblings fires its own onDragEnd and commits its own
  // final position, so this only needs to additionally move non-
  // transformable siblings (text/stroke), and only once per gesture.
  function handleShapeDragEnd(shape: Shape, e: Konva.KonvaEventObject<DragEvent>) {
    const newX = e.target.x();
    const newY = e.target.y();
    shapesMap.set(shape.id, { ...shape, x: newX, y: newY });

    const isPrimary = primaryDragShapeId.current === shape.id;
    if (isPrimary) primaryDragShapeId.current = null;

    if (isPrimary && selectedIds.size > 1 && selectedIds.has(shape.id)) {
      const dx = newX - shape.x;
      const dy = newY - shape.y;
      const primaryIsTransformable = TRANSFORMABLE_TYPES.has(shape.type);
      doc.transact(() => {
        selectedIds.forEach((id) => {
          if (id === shape.id) return;
          const sibling = shapesMap.get(id);
          if (!sibling) return;
          if (primaryIsTransformable && TRANSFORMABLE_TYPES.has(sibling.type)) return;
          shapesMap.set(id, { ...sibling, x: sibling.x + dx, y: sibling.y + dy });
        });
      });
    }
  }

  const editingSticky = editingStickyId ? shapesMap.get(editingStickyId) : undefined;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-100">
      <Toolbar tool={tool} onChange={setTool} onAskAi={boardSync.requestAiReview} />
      {singleSelectedSticky && (
        <StickyColorPicker
          color={singleSelectedSticky.color}
          onPick={(color) => shapesMap.set(singleSelectedSticky.id, { ...singleSelectedSticky, color })}
        />
      )}
      <PeerList peers={presencePeers} localAwarenessClientID={awareness.clientID} />
      {pendingCount > 0 && (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-md">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">
            {pendingCount}
          </span>
          AI suggestion{pendingCount === 1 ? '' : 's'} to review
        </div>
      )}
      {hoveredShape?.pendingReview && <ReviewTooltip shape={hoveredShape} shapesMap={shapesMap} />}
      {singleSelectedPending && (
        <PendingReviewControls
          shape={singleSelectedPending}
          shapesMap={shapesMap}
          onAccept={() => handleAccept(singleSelectedPending)}
          onReject={() => handleReject(singleSelectedPending)}
        />
      )}
      {editingStickyId && editingSticky?.type === 'sticky' && (
        <textarea
          autoFocus
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onBlur={commitStickyEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingStickyId(null);
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitStickyEdit();
            }
          }}
          className="absolute z-20 resize-none rounded-sm border-2 border-neutral-900 p-2 text-sm text-neutral-800 outline-none"
          style={{
            left: editingSticky.x,
            top: editingSticky.y,
            width: editingSticky.width,
            height: editingSticky.height,
            backgroundColor: editingSticky.color,
          }}
        />
      )}
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDblClick={handleDblClick}
      >
        <Layer>
          {pendingGroupBoxes.map((box) => (
            <Rect
              key={box.groupId}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              stroke={GROUP_BOX_COLOR}
              dash={[8, 5]}
              strokeWidth={2}
              fill="rgba(124,58,237,0.04)"
              cornerRadius={8}
              listening={false}
            />
          ))}

          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              shapesMap={shapesMap}
              selected={selectedIds.has(shape.id)}
              draggable={tool === 'select' && shape.type !== 'arrow'}
              onSelect={(e) => handleSelectShape(shape.id, e)}
              onDragStart={() => handleShapeDragStart(shape.id)}
              onDragEnd={(e) => handleShapeDragEnd(shape, e)}
              hideText={shape.id === editingStickyId}
              registerNode={TRANSFORMABLE_TYPES.has(shape.type) ? registerNode(shape.id) : undefined}
              onHoverChange={(hovering) => handleHoverChange(shape.id, hovering)}
            />
          ))}

          <SelectionTransformer
            doc={doc}
            shapesMap={shapesMap}
            shapeIds={transformableSelectedIds}
            nodeRefs={shapeNodeRefs}
            active={tool === 'select'}
          />

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
          {draft?.kind === 'marquee' && (
            <Rect
              x={draft.x}
              y={draft.y}
              width={draft.width}
              height={draft.height}
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              dash={[4, 4]}
              listening={false}
            />
          )}
          {arrowDraft && (
            <>
              <Arrow
                points={[arrowDraft.fromPoint.x, arrowDraft.fromPoint.y, arrowDraft.toPoint.x, arrowDraft.toPoint.y]}
                stroke="#1f2937"
                fill="#1f2937"
                strokeWidth={2}
                dash={[6, 4]}
                pointerLength={10}
                pointerWidth={10}
                listening={false}
              />
              {arrowDraft.toId && (
                <Circle
                  x={arrowDraft.toPoint.x}
                  y={arrowDraft.toPoint.y}
                  radius={5}
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="#ffffff"
                  listening={false}
                />
              )}
            </>
          )}
        </Layer>
        <Layer listening={false}>
          <CursorLayer peers={remotePeers} presentClientIDs={presentClientIDs} />
        </Layer>
      </Stage>
    </div>
  );
}
