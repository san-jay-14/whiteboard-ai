import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './env';
import type { ShapeGraph } from './shapes/types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-4-8';

// The `propose_*` tools add brand-new proposals (brief section 5). move_shape
// and update_shape modify EXISTING shapes — needed for directed instructions
// like "redraw neatly" or "optimize this layout" — but still only as pending
// proposals a human accepts or rejects (the executor stores the pre-proposal
// values so a reject reverts rather than deletes).
const UPDATABLE_FIELDS = [
  'text',
  'fill',
  'stroke',
  'color',
  'width',
  'height',
  'radiusX',
  'radiusY',
  'fontSize',
  'opacity',
  'strokeStyle',
  'strokeWidth',
  'rotation',
] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_shape',
    description:
      'Create a brand-new shape from scratch as a proposal. This is how you DRAW: use it to build diagrams, boxes, labels, and connectors when asked to draw, build, sketch, or lay out something (e.g. an architecture or flow diagram) — including on an empty board. Emit one call per shape. To connect two boxes you are creating in the same request, give each box a unique "ref" and reference them from an arrow via fromRef/toRef.',
    input_schema: {
      type: 'object',
      properties: {
        shapeType: { type: 'string', enum: ['rect', 'ellipse', 'diamond', 'text', 'arrow'] },
        ref: {
          type: 'string',
          description: 'Optional temporary handle you assign to this shape so an arrow in the same request can link to it via fromRef/toRef.',
        },
        reason: { type: 'string' },
        x: { type: 'number', description: 'Left edge (top-left anchor); center X for ellipse. In board coordinates. Not needed for arrows.' },
        y: { type: 'number', description: 'Top edge (top-left anchor); center Y for ellipse. Not needed for arrows.' },
        width: { type: 'number', description: 'For rect/diamond. Defaults to 160.' },
        height: { type: 'number', description: 'For rect/diamond. Defaults to 80.' },
        radiusX: { type: 'number', description: 'For ellipse. Defaults to 80.' },
        radiusY: { type: 'number', description: 'For ellipse. Defaults to 50.' },
        text: {
          type: 'string',
          description: 'For type "text", the text content. For rect/ellipse/diamond, an optional label drawn centered inside the shape.',
        },
        fontSize: { type: 'number', description: 'Text size. Defaults to 20 (16 for labels inside shapes).' },
        fill: { type: 'string', description: 'Fill color as hex (rect/ellipse/diamond). Defaults to transparent.' },
        stroke: { type: 'string', description: 'Outline color (shapes) or text color, as hex. Defaults to #1e1e1e.' },
        fromRef: { type: 'string', description: 'For an arrow: the ref of the source shape created in this same request.' },
        toRef: { type: 'string', description: 'For an arrow: the ref of the target shape created in this same request.' },
        fromShapeId: { type: 'string', description: 'For an arrow between shapes that ALREADY exist on the board.' },
        toShapeId: { type: 'string', description: 'For an arrow between shapes that ALREADY exist on the board.' },
      },
      required: ['shapeType', 'reason'],
    },
  },
  {
    name: 'propose_connector',
    description: 'Suggest an arrow between two shapes that appear related but aren\'t yet connected',
    input_schema: {
      type: 'object',
      properties: {
        fromShapeId: { type: 'string' },
        toShapeId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['fromShapeId', 'toShapeId', 'reason'],
    },
  },
  {
    name: 'propose_group',
    description: 'Suggest that a set of shapes be visually grouped (e.g. likely duplicates or a cluster)',
    input_schema: {
      type: 'object',
      properties: {
        shapeIds: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
      required: ['shapeIds', 'reason'],
    },
  },
  {
    name: 'propose_annotation',
    description: 'Suggest a short text annotation near a shape, e.g. flagging a missing case in a flow',
    input_schema: {
      type: 'object',
      properties: {
        nearShapeId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['nearShapeId', 'text'],
    },
  },
  {
    name: 'move_shape',
    description:
      'Propose moving an existing shape to a new absolute position (its top-left / center anchor). Use for tidying layout, aligning, or spacing shapes evenly, e.g. when asked to redraw neatly.',
    input_schema: {
      type: 'object',
      properties: {
        shapeId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['shapeId', 'x', 'y', 'reason'],
    },
  },
  {
    name: 'update_shape',
    description:
      'Propose editing properties of an existing shape (only include the fields you want to change). Use for fixing text, resizing, recoloring, or restyling. Do not change a shape\'s type or id.',
    input_schema: {
      type: 'object',
      properties: {
        shapeId: { type: 'string' },
        reason: { type: 'string' },
        text: { type: 'string' },
        fill: { type: 'string' },
        stroke: { type: 'string' },
        color: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        radiusX: { type: 'number' },
        radiusY: { type: 'number' },
        fontSize: { type: 'number' },
        opacity: { type: 'number' },
        strokeStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
        strokeWidth: { type: 'number' },
        rotation: { type: 'number' },
      },
      required: ['shapeId', 'reason'],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI collaborator on a shared, real-time whiteboard. People sketch diagrams, flows, and notes together in real time. On each turn you're shown the current board as JSON: a map of shape id -> shape data (type, position, and type-specific fields such as text, or a connector's fromShapeId/toShapeId).

Everything you do is a PROPOSAL: your changes appear with a dashed outline for a human to accept or reject. Nothing is applied automatically. You have these tools:
- create_shape: draw a NEW shape from scratch (rect, ellipse, diamond, text, or arrow). This is how you build diagrams/boxes/labels/connectors when asked to draw or lay something out, including on an empty board.
- propose_connector: add an arrow between two shapes that ALREADY exist and are clearly related but not yet connected.
- propose_group: group several shapes that look like duplicates or an obvious cluster that isn't grouped yet.
- propose_annotation: add a short note flagging something clearly missing or worth double-checking near a shape.
- move_shape: reposition an existing shape (for aligning, spacing, or tidying layout).
- update_shape: edit properties of an existing shape (text, size, color, style). Only include fields you're changing.

Two modes:
1. No user instruction (a background pass): behave conservatively. Only propose a change when you're genuinely confident it's useful, and prefer the lighter-touch tools (do NOT spontaneously draw new diagrams). Making ZERO tool calls is a normal, expected outcome — most boards most of the time need nothing. Do not propose something already reflected on the board.
2. A user instruction is given (shown below the board): treat it as the goal for this pass and act on it directly. For "draw / build / sketch / lay out X" requests, use create_shape to produce the whole diagram — boxes with labels, arranged in a sensible non-overlapping layout, connected with arrows. For layout requests ("redraw neatly", "align these", "space evenly") use move_shape/update_shape. For "optimize"/"clean up", group duplicates, align, and connect related nodes. Make as many proposals as the instruction reasonably needs, but don't invent unrelated changes.

Drawing guidance for create_shape: lay shapes out on a grid in board coordinates starting around (100, 100); typical box is ~160x80 with generous spacing (e.g. 220px horizontally, 140px vertically) so nothing overlaps. Give boxes a short label via the "text" field. To connect boxes you're creating now, set a unique "ref" on each box and reference them from an arrow's fromRef/toRef (arrows need no x/y/size). Prefer left-to-right or top-to-bottom flow.

Always give a short, specific reason for each proposal. Coordinates are in board space; a shape's x/y is its anchor and its other fields (width/height, points, etc.) are relative to it, so moving x/y moves the whole shape. Never change an existing shape's id or type. After your tool calls, briefly state in plain text what you proposed (one or two sentences) so the human sees a summary.`;

export type ProposeConnectorInput = { fromShapeId: string; toShapeId: string; reason: string };
export type ProposeGroupInput = { shapeIds: string[]; reason: string };
export type ProposeAnnotationInput = { nearShapeId: string; text: string };
export type MoveShapeInput = { shapeId: string; x: number; y: number; reason: string };
export type UpdateShapeInput = { shapeId: string; reason: string } & Record<string, unknown>;
export type CreateShapeInput = {
  shapeType: 'rect' | 'ellipse' | 'diamond' | 'text' | 'arrow';
  ref?: string;
  reason: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radiusX?: number;
  radiusY?: number;
  text?: string;
  fontSize?: number;
  fill?: string;
  stroke?: string;
  fromRef?: string;
  toRef?: string;
  fromShapeId?: string;
  toShapeId?: string;
};

export type ToolCall =
  | { name: 'create_shape'; input: CreateShapeInput }
  | { name: 'propose_connector'; input: ProposeConnectorInput }
  | { name: 'propose_group'; input: ProposeGroupInput }
  | { name: 'propose_annotation'; input: ProposeAnnotationInput }
  | { name: 'move_shape'; input: MoveShapeInput }
  | { name: 'update_shape'; input: UpdateShapeInput };

export const UPDATABLE_FIELD_SET: ReadonlySet<string> = new Set(UPDATABLE_FIELDS);

// A single entry in the shared interaction log (Yjs 'aiLog' array). Kept in
// sync with the frontend copy in frontend/src/lib/aiLog.ts.
export type AiLogEntry = { role: 'user' | 'assistant'; text: string; ts: number };

function toToolCall(block: Anthropic.ToolUseBlock): ToolCall | null {
  switch (block.name) {
    case 'create_shape':
      return { name: 'create_shape', input: block.input as CreateShapeInput };
    case 'propose_connector':
      return { name: 'propose_connector', input: block.input as ProposeConnectorInput };
    case 'propose_group':
      return { name: 'propose_group', input: block.input as ProposeGroupInput };
    case 'propose_annotation':
      return { name: 'propose_annotation', input: block.input as ProposeAnnotationInput };
    case 'move_shape':
      return { name: 'move_shape', input: block.input as MoveShapeInput };
    case 'update_shape':
      return { name: 'update_shape', input: block.input as UpdateShapeInput };
    default:
      return null; // Claude can't call anything else, but stay defensive.
  }
}

export type ReasoningResult = { calls: ToolCall[]; text: string };

export type ReasoningOptions = {
  // A human's free-text instruction for this pass (from the "Ask AI" prompt).
  // Absent for background/debounce passes.
  instruction?: string;
  // Recent entries from the shared interaction log, oldest first, so the
  // model has continuity across passes even without a chat interface.
  history?: AiLogEntry[];
};

function buildUserMessage(shapeGraph: ShapeGraph, opts: ReasoningOptions): string {
  const parts: string[] = [];
  const history = (opts.history ?? []).filter((e): e is AiLogEntry => !!e && typeof e.text === 'string');
  if (history.length > 0) {
    const transcript = history
      .map((e) => `${e.role === 'user' ? 'Human' : 'AI'}: ${e.text}`)
      .join('\n');
    parts.push(`Recent interaction history (for context):\n${transcript}`);
  }
  parts.push(`Current board (JSON, shape id -> shape):\n${JSON.stringify(shapeGraph)}`);
  if (opts.instruction && opts.instruction.trim()) {
    parts.push(`The human has asked you to do the following now:\n"${opts.instruction.trim()}"`);
  } else {
    parts.push('No specific instruction — do a conservative background review.');
  }
  return parts.join('\n\n');
}

// One reasoning pass: serialize the board (+ optional instruction/history),
// ask Claude, and return whatever proposals it made (possibly none — that's
// expected, not an error) plus a short natural-language summary for the log.
export async function runReasoningPass(
  shapeGraph: ShapeGraph,
  opts: ReasoningOptions = {},
): Promise<ReasoningResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages: [{ role: 'user', content: buildUserMessage(shapeGraph, opts) }],
  });

  if (response.stop_reason === 'refusal') {
    console.warn('[reasoning] model declined to respond this pass; treating as no suggestions');
    return { calls: [], text: '' };
  }

  const calls: ToolCall[] = [];
  const textParts: string[] = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const call = toToolCall(block);
      if (call) calls.push(call);
    } else if (block.type === 'text') {
      textParts.push(block.text);
    }
  }
  return { calls, text: textParts.join(' ').trim() };
}
