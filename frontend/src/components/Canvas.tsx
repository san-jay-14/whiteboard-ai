import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Ellipse, Layer, Line, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import * as Y from 'yjs';
import { useBoardSession } from '../lib/BoardSessionContext';
import { useShapes } from '../hooks/useShapes';
import { useAwareness } from '../hooks/useAwareness';
import { usePresence } from '../hooks/usePresence';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import {
  createArrow,
  createDiamond,
  createEllipse,
  createImage,
  createLine,
  createRect,
  createSticky,
  createStroke,
  createText,
} from '../lib/shapes';
import {
  applyStylePatch,
  deriveItemStyle,
  loadItemStyle,
  saveItemStyle,
  shapeSupportsEdges,
  shapeSupportsFill,
  shapeSupportsStroke,
  shapeSupportsStrokeWidth,
  themedStyle,
  FONT_FAMILY_CSS,
  type ItemStyle,
} from '../lib/itemStyle';
import { useTheme } from '../lib/theme';
import { adjustColorForTheme } from '../lib/themeColor';
import { deleteShapesCascading } from '../lib/deleteShapes';
import { acceptShape, rejectShape } from '../lib/reviewActions';
import { useAiEnabled, useAiLog } from '../lib/aiLog';
import {
  getArrowEndpoints,
  getRotatedAABB,
  getShapeAnchors,
  nearestAnchor,
  rectsIntersect,
  type Anchor,
} from '../lib/geometry';
import { STICKY_DEFAULT_SIZE } from '../lib/constants';
import {
  ZOOM_STEP,
  fitBoundsToViewport,
  loadViewport,
  saveViewport,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomToCenter,
  type Point as ViewportPoint,
  type Viewport,
} from '../lib/viewport';
import type { Shape } from '../lib/types';
import ShapeRenderer from './ShapeRenderer';
import SelectionTransformer from './SelectionTransformer';
import CursorLayer from './CursorLayer';
import PeerList from './PeerList';
import PendingReviewControls from './PendingReviewControls';
import ReviewTooltip from './ReviewTooltip';
import PropertiesPanel from './PropertiesPanel';
import TextEditor from './TextEditor';
import ZoomControls from './ZoomControls';
import Menu from './Menu';
import LibraryPanel from './LibraryPanel';
import AiActivityPanel from './AiActivityPanel';
import AgentThinkingIndicator from './AgentThinkingIndicator';
import { copyPngToClipboard, downloadPng, downloadSvg } from '../lib/exportImage';
import { addToLibrary, instantiateLibraryItem, type LibraryItem } from '../lib/library';
import { showErrorToast } from '../lib/toast';
import Toolbar, { type Tool } from './Toolbar';
import { TOOL_SHORTCUTS } from '../lib/tools';

const GROUP_BOX_COLOR = '#7c3aed';
const GROUP_BOX_PADDING = 10;

type Props = {
  ownerId: string;
  uid: string;
  onBack: () => void;
};

type Point = { x: number; y: number };

type Draft =
  | { kind: 'rect' | 'ellipse' | 'diamond' | 'marquee'; x: number; y: number; width: number; height: number }
  | { kind: 'pen'; points: number[] }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

type ArrowDraft = {
  fromId: string;
  fromPoint: Anchor;
  toPoint: Anchor;
  toId: string | null;
};

const MIN_DRAG = 3;
const CURSOR_THROTTLE_MS = 50;
const TRANSFORMABLE_TYPES = new Set<Shape['type']>(['rect', 'ellipse', 'diamond', 'sticky', 'image']);

// Shortest distance from a point to a line segment (for erasing/targeting
// arrows, which have no fillable area).
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export default function Canvas({ ownerId, uid, onBack }: Props) {
  const { boardId, doc, shapesMap, metaMap, aiLog, awareness, boardSync } = useBoardSession();
  const shapes = useShapes();
  const aiEnabled = useAiEnabled(metaMap);
  const aiEntries = useAiLog(aiLog);
  const toggleAi = useCallback(() => {
    metaMap.set('aiEnabled', !aiEnabled);
  }, [metaMap, aiEnabled]);
  const remotePeers = useAwareness();
  const presencePeers = usePresence();
  // Transient "the AI is working" status, broadcast by the agent via presence.
  const agentStatus = useMemo(
    () => presencePeers.find((p) => p.kind === 'agent' && p.status)?.status ?? null,
    [presencePeers],
  );
  const connectionStatus = useConnectionStatus();
  const stageRef = useRef<Konva.Stage>(null);
  const dragStart = useRef<Point | null>(null);
  const lastCursorSentAt = useRef(0);
  // Pan gesture (space-drag / middle-mouse): screen point where the drag
  // started plus the viewport at that moment, so each move is an absolute
  // offset rather than an accumulating delta.
  const panStart = useRef<{ screen: ViewportPoint; viewport: Viewport } | null>(null);
  const erasingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  // Inline text editor: id null = creating new text at (x,y) world coords,
  // id set = editing that existing text shape.
  const [textEdit, setTextEdit] = useState<{ id: string | null; x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [hoveredPendingId, setHoveredPendingId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => loadViewport(boardId));
  // Current item style — seeds every new shape and is edited by the
  // properties panel (persisted across sessions).
  const [itemStyle, setItemStyle] = useState<ItemStyle>(() => loadItemStyle());
  const theme = useTheme();
  // Style actually applied to new shapes: the default black/white stroke
  // follows the theme so shapes stay visible on the dark canvas.
  const drawStyle = themedStyle(itemStyle, theme === 'dark');

  // Undo/redo scoped to local edits only: local shapesMap writes carry a
  // null transaction origin (tracked by default), while remote/AI updates
  // carry REMOTE_ORIGIN (see realtimeSync.ts) and are ignored. The manager is
  // created inside the effect (not useMemo) so StrictMode's mount→unmount→
  // mount cycle can't leave a destroyed instance behind.
  const undoRef = useRef<Y.UndoManager | null>(null);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const um = new Y.UndoManager(shapesMap, { captureTimeout: 250 });
    undoRef.current = um;
    const update = () => setUndoState({ canUndo: um.undoStack.length > 0, canRedo: um.redoStack.length > 0 });
    um.on('stack-item-added', update);
    um.on('stack-item-popped', update);
    update();
    return () => {
      um.off('stack-item-added', update);
      um.off('stack-item-popped', update);
      um.destroy();
      undoRef.current = null;
    };
  }, [shapesMap]);
  // Space held = temporary pan mode (grab cursor, shapes non-draggable);
  // panning = a pan drag is in progress (grabbing cursor).
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // Optional per-board canvas background override ('' = follow the theme).
  const [canvasBg, setCanvasBg] = useState<string>(() => localStorage.getItem(`wb:canvasbg:${boardId}`) ?? '');

  const presentClientIDs = useMemo(
    () => new Set(presencePeers.map((peer) => peer.awarenessClientID)),
    [presencePeers],
  );

  const selectedShapes = useMemo(() => shapes.filter((s) => selectedIds.has(s.id)), [shapes, selectedIds]);

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

  // Accept/reject every pending shape at once — a from-scratch AI diagram can
  // be dozens of proposals, so reviewing them one by one is impractical. Runs
  // in a single transaction so it's one undo step and one broadcast.
  function handleReviewAll(accept: boolean) {
    const pending = shapes.filter((s) => s.pendingReview);
    if (pending.length === 0) return;
    doc.transact(() => {
      pending.forEach((s) => (accept ? acceptShape(shapesMap, s) : rejectShape(shapesMap, s)));
    });
    setSelectedIds(new Set());
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Typing in any inline editor (sticky/text) — not a canvas shortcut.
      if (editingStickyId || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) undoRef.current?.redo();
        else undoRef.current?.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        undoRef.current?.redo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteShapesCascading(doc, shapesMap, Array.from(selectedIds));
        setSelectedIds(new Set());
      }
      if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && selectedIds.size > 0) {
        e.preventDefault();
        const clones: Shape[] = [];
        selectedIds.forEach((id) => {
          const s = shapesMap.get(id);
          if (s) clones.push({ ...s, id: crypto.randomUUID(), x: s.x + 16, y: s.y + 16, createdAt: Date.now() });
        });
        doc.transact(() => clones.forEach((c) => shapesMap.set(c.id, c)));
        setSelectedIds(new Set(clones.map((c) => c.id)));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, editingStickyId, doc, shapesMap]);

  // World-space pointer (accounts for the Stage pan/zoom transform) — used
  // for everything that lives in shape coordinates: creating shapes, marquee,
  // pen points, arrow anchoring, and broadcast cursor position.
  function pointerPos(): Point | null {
    return stageRef.current?.getRelativePointerPosition() ?? null;
  }

  // Raw screen-space pointer (relative to the Stage container, ignores the
  // transform) — used for pan deltas and zoom-toward-cursor anchoring.
  function screenPointerPos(): ViewportPoint | null {
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

  // Topmost shape whose geometry contains a world point. Geometric (not
  // Konva getIntersection) so it's zoom-safe and hits a shape's whole area —
  // matching Excalidraw's generous eraser and connector targeting. `shapes`
  // is sorted ascending by z, so iterate in reverse for topmost-first.
  function shapeAtWorldPoint(p: Point, excludeArrows = false): string | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === 'arrow') {
        if (excludeArrows) continue;
        const ep = getArrowEndpoints(s, (id) => shapesMap.get(id));
        if (ep && distToSegment(p, ep.from, ep.to) <= 8) return s.id;
        continue;
      }
      const b = getRotatedAABB(s);
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return s.id;
    }
    return null;
  }

  function findAttachableShapeIdUnderCursor(exclude: Set<string>): string | null {
    const pos = pointerPos();
    if (!pos) return null;
    const id = shapeAtWorldPoint(pos, true); // arrows can't attach to arrows
    if (!id || exclude.has(id)) return null;
    return id;
  }

  function eraseUnderCursor() {
    const pos = pointerPos();
    if (!pos) return;
    const id = shapeAtWorldPoint(pos);
    if (!id || !shapesMap.has(id)) return;
    deleteShapesCascading(doc, shapesMap, [id]);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // Commit a freshly-drawn shape, then select it and return to the select
  // tool (Excalidraw's default post-draw behaviour).
  function placeShape(shape: Shape) {
    shapesMap.set(shape.id, shape);
    setSelectedIds(new Set([shape.id]));
    setTool('select');
  }

  // Reads an image file, scales it to a sane on-canvas size, and drops it at
  // the given world point (default: viewport centre). Used by the image tool,
  // paste, and drag-and-drop.
  function placeImageFromFile(file: File, worldPoint?: { x: number; y: number }) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const probe = new window.Image();
      probe.onload = () => {
        const MAX_DIM = 400;
        const scale = Math.min(1, MAX_DIM / Math.max(probe.width, probe.height));
        const w = Math.round(probe.width * scale);
        const h = Math.round(probe.height * scale);
        const center =
          worldPoint ?? screenToWorld(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        placeShape(createImage(center.x - w / 2, center.y - h / 2, src, w, h));
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }

  // ── Properties-panel wiring ──────────────────────────────────────────
  // Which shape kinds the panel's controls target: the current selection, or
  // (with nothing selected) the shape the active drawing tool will create.
  const TOOL_KIND: Partial<Record<Tool, Shape['type']>> = {
    rect: 'rect',
    diamond: 'diamond',
    ellipse: 'ellipse',
    line: 'line',
    arrow: 'arrow',
    pen: 'stroke',
    text: 'text',
    sticky: 'sticky',
  };
  const contextKinds = useMemo<Set<Shape['type']>>(() => {
    if (selectedShapes.length) return new Set(selectedShapes.map((s) => s.type));
    const k = TOOL_KIND[tool];
    return k ? new Set([k]) : new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapes, tool]);

  const anyKind = (pred: (t: Shape['type']) => boolean) => [...contextKinds].some(pred);
  const showPanel = selectedShapes.length > 0 || contextKinds.size > 0;
  const panelStyle: ItemStyle = selectedShapes.length
    ? { ...itemStyle, ...deriveItemStyle(selectedShapes[0]) }
    : itemStyle;
  const stickyMode = contextKinds.size > 0 && [...contextKinds].every((k) => k === 'sticky');

  function updateStyle(patch: Partial<ItemStyle>) {
    setItemStyle((prev) => ({ ...prev, ...patch }));
    if (selectedShapes.length) {
      doc.transact(() => {
        selectedShapes.forEach((s) => shapesMap.set(s.id, applyStylePatch(s, patch)));
      });
    }
  }

  function changeLayer(action: 'back' | 'backward' | 'forward' | 'front') {
    if (!selectedShapes.length) return;
    const zs = shapes.map((s) => s.z ?? 0);
    const maxZ = zs.length ? Math.max(...zs) : 0;
    const minZ = zs.length ? Math.min(...zs) : 0;
    doc.transact(() => {
      selectedShapes.forEach((s) => {
        const cur = s.z ?? 0;
        const z =
          action === 'front' ? maxZ + 1 : action === 'back' ? minZ - 1 : action === 'forward' ? cur + 1 : cur - 1;
        shapesMap.set(s.id, { ...s, z });
      });
    });
  }

  type AlignAction = 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom';
  function alignSelection(action: AlignAction) {
    const items = selectedShapes.filter((s) => s.type !== 'arrow').map((s) => ({ s, b: getRotatedAABB(s) }));
    if (items.length < 2) return;
    const minX = Math.min(...items.map((o) => o.b.x));
    const maxX = Math.max(...items.map((o) => o.b.x + o.b.width));
    const minY = Math.min(...items.map((o) => o.b.y));
    const maxY = Math.max(...items.map((o) => o.b.y + o.b.height));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    doc.transact(() => {
      for (const { s, b } of items) {
        let dx = 0;
        let dy = 0;
        if (action === 'left') dx = minX - b.x;
        else if (action === 'right') dx = maxX - (b.x + b.width);
        else if (action === 'center-h') dx = cx - (b.x + b.width / 2);
        else if (action === 'top') dy = minY - b.y;
        else if (action === 'bottom') dy = maxY - (b.y + b.height);
        else if (action === 'middle-v') dy = cy - (b.y + b.height / 2);
        if (dx || dy) shapesMap.set(s.id, { ...s, x: s.x + dx, y: s.y + dy });
      }
    });
  }

  function distributeSelection(axis: 'h' | 'v') {
    const items = selectedShapes.filter((s) => s.type !== 'arrow').map((s) => ({ s, b: getRotatedAABB(s) }));
    if (items.length < 3) return;
    const center = (o: { b: { x: number; y: number; width: number; height: number } }) =>
      axis === 'h' ? o.b.x + o.b.width / 2 : o.b.y + o.b.height / 2;
    items.sort((a, b) => center(a) - center(b));
    const first = center(items[0]);
    const step = (center(items[items.length - 1]) - first) / (items.length - 1);
    doc.transact(() => {
      items.forEach((o, i) => {
        if (i === 0 || i === items.length - 1) return;
        const d = first + step * i - center(o);
        if (axis === 'h') shapesMap.set(o.s.id, { ...o.s, x: o.s.x + d });
        else shapesMap.set(o.s.id, { ...o.s, y: o.s.y + d });
      });
    });
  }

  function duplicateSelection() {
    if (!selectedShapes.length) return;
    const clones = selectedShapes.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      x: s.x + 16,
      y: s.y + 16,
      createdAt: Date.now(),
    }));
    doc.transact(() => clones.forEach((c) => shapesMap.set(c.id, c)));
    setSelectedIds(new Set(clones.map((c) => c.id)));
  }

  function deleteSelection() {
    if (!selectedShapes.length) return;
    deleteShapesCascading(doc, shapesMap, Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  function handleSelectShape(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    if (tool !== 'select' || isSpaceDown) return;
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
    // Pan gesture: middle-mouse anywhere, or left-mouse while Space is held
    // or the hand tool is active. Takes priority over drawing/selection.
    if (e.evt.button === 1 || ((isSpaceDown || tool === 'hand') && e.evt.button === 0)) {
      const screen = screenPointerPos();
      if (screen) {
        panStart.current = { screen, viewport };
        setIsPanning(true);
      }
      return;
    }

    if (tool === 'eraser') {
      erasingRef.current = true;
      eraseUnderCursor();
      return;
    }

    const clickedOnEmpty = e.target === e.target.getStage();
    const pos = pointerPos();
    if (!pos) return;

    if (tool === 'select') {
      if (!clickedOnEmpty) return; // individual shape handlers manage selection/drag
      dragStart.current = pos;
      setDraft({ kind: 'marquee', x: pos.x, y: pos.y, width: 0, height: 0 });
      return;
    }

    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
      dragStart.current = pos;
      setDraft({ kind: tool, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (tool === 'line') {
      dragStart.current = pos;
      setDraft({ kind: 'line', x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
    } else if (tool === 'pen') {
      setDraft({ kind: 'pen', points: [pos.x, pos.y] });
    } else if (tool === 'text') {
      setTextEdit({ id: null, x: pos.x, y: pos.y });
      setTextValue('');
      setTool('select');
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
    if (panStart.current) {
      const screen = screenPointerPos();
      if (screen) {
        const { screen: start, viewport: vpStart } = panStart.current;
        setViewport({
          scale: vpStart.scale,
          x: vpStart.x + (screen.x - start.x),
          y: vpStart.y + (screen.y - start.y),
        });
      }
      return;
    }

    const pos = pointerPos();
    updateCursorAwareness(pos);
    if (erasingRef.current) {
      eraseUnderCursor();
      return;
    }
    if (!pos) return;

    if (draft) {
      if (draft.kind === 'pen') {
        setDraft({ kind: 'pen', points: [...draft.points, pos.x, pos.y] });
        return;
      }
      if (draft.kind === 'line') {
        setDraft({ ...draft, x2: pos.x, y2: pos.y });
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
    if (panStart.current) {
      panStart.current = null;
      setIsPanning(false);
      return;
    }

    if (erasingRef.current) {
      erasingRef.current = false;
      return;
    }

    if (draft) {
      if (draft.kind === 'rect' && draft.width > MIN_DRAG && draft.height > MIN_DRAG) {
        placeShape(createRect(draft.x, draft.y, draft.width, draft.height, drawStyle));
      } else if (draft.kind === 'diamond' && draft.width > MIN_DRAG && draft.height > MIN_DRAG) {
        placeShape(createDiamond(draft.x, draft.y, draft.width, draft.height, drawStyle));
      } else if (draft.kind === 'ellipse' && draft.width > MIN_DRAG && draft.height > MIN_DRAG) {
        placeShape(
          createEllipse(
            draft.x + draft.width / 2,
            draft.y + draft.height / 2,
            draft.width / 2,
            draft.height / 2,
            drawStyle,
          ),
        );
      } else if (draft.kind === 'line') {
        const dx = draft.x2 - draft.x1;
        const dy = draft.y2 - draft.y1;
        if (Math.abs(dx) > MIN_DRAG || Math.abs(dy) > MIN_DRAG) {
          placeShape(createLine(draft.x1, draft.y1, [0, 0, dx, dy], drawStyle));
        }
      } else if (draft.kind === 'pen' && draft.points.length >= 4) {
        const xs = draft.points.filter((_, i) => i % 2 === 0);
        const ys = draft.points.filter((_, i) => i % 2 === 1);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const relativePoints = draft.points.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
        placeShape(createStroke(minX, minY, relativePoints, drawStyle));
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
          placeShape(createArrow(fromShape, toShape, drawStyle));
        }
      }
      setArrowDraft(null);
    }
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const screen = screenPointerPos();
    if (!screen) return;
    // ctrl/⌘+wheel and trackpad pinch (which browsers report as ctrl+wheel)
    // zoom toward the cursor; a plain wheel pans; shift makes it horizontal.
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const factor = e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setViewport((vp) => zoomAt(vp, vp.scale * factor, screen));
    } else {
      const dx = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
      const dy = e.evt.shiftKey ? 0 : e.evt.deltaY;
      setViewport((vp) => ({ ...vp, x: vp.x - dx, y: vp.y - dy }));
    }
  }

  function zoomIn() {
    setViewport((vp) => zoomToCenter(vp, vp.scale * ZOOM_STEP, window.innerWidth, window.innerHeight));
  }
  function zoomOut() {
    setViewport((vp) => zoomToCenter(vp, vp.scale / ZOOM_STEP, window.innerWidth, window.innerHeight));
  }
  function resetZoom() {
    setViewport((vp) => zoomToCenter(vp, 1, window.innerWidth, window.innerHeight));
  }
  function zoomToFit() {
    const boxes = shapes.filter((s) => s.type !== 'arrow').map(getRotatedAABB);
    if (boxes.length === 0) {
      setViewport({ x: 0, y: 0, scale: 1 });
      return;
    }
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    setViewport(
      fitBoundsToViewport(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }

  // Effective background used for exports: the per-board override, else the
  // theme's canvas colour.
  const exportBg = canvasBg || (theme === 'dark' ? '#121212' : '#ffffff');

  useEffect(() => {
    if (canvasBg) localStorage.setItem(`wb:canvasbg:${boardId}`, canvasBg);
    else localStorage.removeItem(`wb:canvasbg:${boardId}`);
  }, [boardId, canvasBg]);

  async function handleExportPng() {
    try {
      await downloadPng(shapes, exportBg);
    } catch (e) {
      showErrorToast(`Couldn't export PNG: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  function handleExportSvg() {
    downloadSvg(shapes, exportBg);
  }
  async function handleCopyPng() {
    try {
      await copyPngToClipboard(shapes, exportBg);
    } catch (e) {
      showErrorToast(`Couldn't copy image: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  function handleResetCanvas() {
    if (shapes.length > 0 && !window.confirm('Clear the entire canvas? This cannot be undone by peers.')) return;
    doc.transact(() => shapesMap.clear());
    setSelectedIds(new Set());
  }

  function insertLibraryItem(item: LibraryItem) {
    const origin = screenToWorld(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newShapes = instantiateLibraryItem(item, origin);
    if (newShapes.length === 0) return;
    doc.transact(() => newShapes.forEach((s) => shapesMap.set(s.id, s)));
    setSelectedIds(new Set(newShapes.map((s) => s.id)));
    setTool('select');
  }

  // Latest zoom handlers behind a ref so the keyboard-shortcut effect can
  // stay subscribed once while always calling the current closures (which
  // read live `shapes` for zoom-to-fit).
  const zoomActions = useRef({ zoomIn, zoomOut, resetZoom, zoomToFit });
  zoomActions.current = { zoomIn, zoomOut, resetZoom, zoomToFit };

  // Persist viewport per board (debounced so a pan drag doesn't hammer
  // localStorage on every mouse move).
  useEffect(() => {
    const id = setTimeout(() => saveViewport(boardId, viewport), 200);
    return () => clearTimeout(id);
  }, [boardId, viewport]);

  useEffect(() => {
    saveItemStyle(itemStyle);
  }, [itemStyle]);

  // Selecting the image tool opens the file picker, then reverts to select so
  // it doesn't re-fire. The actual insert happens in the input's onChange.
  useEffect(() => {
    if (tool === 'image') {
      fileInputRef.current?.click();
      setTool('select');
    }
  }, [tool]);

  // Paste an image from the clipboard anywhere on the board.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            placeImageFromFile(file);
            e.preventDefault();
          }
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  // Space-to-pan + zoom keyboard shortcuts. Ignored while editing text or
  // typing into a form field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingStickyId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpaceDown(true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomActions.current.zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          zoomActions.current.zoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          zoomActions.current.resetZoom();
        }
        return;
      }
      if (e.shiftKey && e.key === '1') {
        e.preventDefault();
        zoomActions.current.zoomToFit();
        return;
      }
      if (e.key === 'Escape') {
        setTool('select');
        return;
      }
      // Single-key tool shortcuts (V/1, R/2, D/3, …).
      const toolForKey = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (toolForKey) {
        setTool(toolForKey);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
        panStart.current = null;
        setIsPanning(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [editingStickyId]);

  function handleDblClick(e: Konva.KonvaEventObject<MouseEvent>) {
    const clickedOnEmpty = e.target === e.target.getStage();
    const pos = pointerPos();
    if (clickedOnEmpty) {
      if (!pos) return;
      setTextEdit({ id: null, x: pos.x, y: pos.y });
      setTextValue('');
      return;
    }
    const id = resolveShapeId(e.target);
    const shape = id ? shapesMap.get(id) : undefined;
    if (shape?.type === 'sticky') {
      setEditingStickyId(shape.id);
      setEditingText(shape.text);
    } else if (shape?.type === 'text') {
      setTextEdit({ id: shape.id, x: shape.x, y: shape.y });
      setTextValue(shape.text);
    }
  }

  function commitText() {
    if (!textEdit) return;
    const hasContent = textValue.trim().length > 0;
    if (textEdit.id) {
      const shape = shapesMap.get(textEdit.id);
      if (shape && shape.type === 'text') {
        if (hasContent) shapesMap.set(textEdit.id, { ...shape, text: textValue });
        else shapesMap.delete(textEdit.id); // emptied out → remove the text shape
      }
    } else if (hasContent) {
      const shape = createText(textEdit.x, textEdit.y, textValue, drawStyle);
      shapesMap.set(shape.id, shape);
      setSelectedIds(new Set([shape.id]));
    }
    setTextEdit(null);
    setTextValue('');
  }

  function cancelText() {
    setTextEdit(null);
    setTextValue('');
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

  const cursor = isPanning
    ? 'grabbing'
    : isSpaceDown || tool === 'hand'
      ? 'grab'
      : tool !== 'select'
        ? 'crosshair'
        : 'default';

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ cursor, backgroundColor: canvasBg || 'var(--canvas-bg)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) placeImageFromFile(file, screenToWorld(viewport, { x: e.clientX, y: e.clientY }));
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) placeImageFromFile(f);
          e.target.value = '';
        }}
      />
      <Menu
        onBack={onBack}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onCopyPng={handleCopyPng}
        onResetCanvas={handleResetCanvas}
        canvasBg={canvasBg}
        onCanvasBg={setCanvasBg}
        boardId={boardId}
        canInvite={uid === ownerId}
      />
      <Toolbar
        tool={tool}
        onChange={setTool}
        onAskAi={boardSync.requestAiReview}
        aiEnabled={aiEnabled}
        onToggleAi={toggleAi}
      />
      <AiActivityPanel entries={aiEntries} enabled={aiEnabled} />
      <AgentThinkingIndicator status={agentStatus} />
      {showPanel && (
        <PropertiesPanel
          style={panelStyle}
          onChange={updateStyle}
          showStroke={anyKind(shapeSupportsStroke)}
          showBackground={anyKind(shapeSupportsFill)}
          showStrokeWidth={anyKind(shapeSupportsStrokeWidth)}
          showEdges={anyKind(shapeSupportsEdges)}
          showFont={contextKinds.has('text')}
          stickyMode={stickyMode}
          hasSelection={selectedShapes.length > 0}
          selectionCount={selectedShapes.length}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
          onLayer={changeLayer}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
        />
      )}
      <LibraryPanel
        onInsert={insertLibraryItem}
        onSaveSelection={() => addToLibrary(selectedShapes)}
        canSave={selectedShapes.length > 0}
      />
      <PeerList peers={presencePeers} localAwarenessClientID={awareness.clientID} />
      <ZoomControls
        scale={viewport.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetZoom}
        onZoomToFit={zoomToFit}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        onUndo={() => undoRef.current?.undo()}
        onRedo={() => undoRef.current?.redo()}
      />
      {connectionStatus === 'reconnecting' && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white shadow-md">
          Reconnecting…
        </div>
      )}
      {shapes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Nothing here yet — pick a tool above to start drawing. Once you've added a few shapes, use "Ask AI"
            to review the board or tell it what to do (e.g. "redraw it neatly").
          </p>
        </div>
      )}
      {pendingCount > 0 && (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-md dark:bg-neutral-800 dark:text-neutral-200">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">
            {pendingCount}
          </span>
          AI suggestion{pendingCount === 1 ? '' : 's'}
          <span className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-600" />
          <button
            type="button"
            onClick={() => handleReviewAll(true)}
            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => handleReviewAll(false)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15"
          >
            Reject all
          </button>
        </div>
      )}
      {hoveredShape?.pendingReview && (
        <ReviewTooltip shape={hoveredShape} shapesMap={shapesMap} viewport={viewport} />
      )}
      {singleSelectedPending && (
        <PendingReviewControls
          shape={singleSelectedPending}
          shapesMap={shapesMap}
          viewport={viewport}
          onAccept={() => handleAccept(singleSelectedPending)}
          onReject={() => handleReject(singleSelectedPending)}
        />
      )}
      {textEdit &&
        (() => {
          const editing = textEdit.id ? shapesMap.get(textEdit.id) : undefined;
          const textShape = editing?.type === 'text' ? editing : undefined;
          const screen = worldToScreen(viewport, { x: textEdit.x, y: textEdit.y });
          const fontSize = (textShape ? textShape.fontSize : itemStyle.fontSize) * viewport.scale;
          const family = FONT_FAMILY_CSS[(textShape ? textShape.fontFamily : itemStyle.fontFamily) ?? 'hand'];
          const color = adjustColorForTheme(
            textShape ? textShape.color ?? '#1e1e1e' : drawStyle.strokeColor,
            theme === 'dark',
          );
          const align = (textShape ? textShape.textAlign : itemStyle.textAlign) ?? 'left';
          return (
            <TextEditor
              left={screen.x}
              top={screen.y}
              fontSize={fontSize}
              fontFamily={family}
              color={color}
              align={align}
              value={textValue}
              onChange={setTextValue}
              onCommit={commitText}
              onCancel={cancelText}
            />
          );
        })()}
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
          className="absolute z-20 resize-none rounded-sm border-2 border-neutral-900 p-2 text-neutral-800 outline-none"
          style={{
            left: worldToScreen(viewport, editingSticky).x,
            top: worldToScreen(viewport, editingSticky).y,
            width: editingSticky.width * viewport.scale,
            height: editingSticky.height * viewport.scale,
            fontSize: 14 * viewport.scale,
            backgroundColor: editingSticky.color,
            transformOrigin: 'top left',
          }}
        />
      )}
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDblClick={handleDblClick}
        onWheel={handleWheel}
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
              draggable={tool === 'select' && !isSpaceDown && shape.type !== 'arrow'}
              onSelect={(e) => handleSelectShape(shape.id, e)}
              onDragStart={() => handleShapeDragStart(shape.id)}
              onDragEnd={(e) => handleShapeDragEnd(shape, e)}
              hideText={shape.id === editingStickyId || shape.id === textEdit?.id}
              dark={theme === 'dark'}
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
          {draft?.kind === 'diamond' && (
            <Line
              points={[
                draft.x + draft.width / 2,
                draft.y,
                draft.x + draft.width,
                draft.y + draft.height / 2,
                draft.x + draft.width / 2,
                draft.y + draft.height,
                draft.x,
                draft.y + draft.height / 2,
              ]}
              closed
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
          {draft?.kind === 'line' && (
            <Line
              points={[draft.x1, draft.y1, draft.x2, draft.y2]}
              stroke="#111827"
              strokeWidth={2}
              dash={[4, 4]}
              lineCap="round"
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
