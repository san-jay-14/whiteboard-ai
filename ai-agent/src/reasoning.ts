import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './env';
import type { ShapeGraph } from './shapes/types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-4-8';

// Verbatim from PROJECT_BRIEF.md section 5 — do not add fields (note
// propose_annotation has no `reason`, unlike the other two).
const TOOLS: Anthropic.Tool[] = [
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
];

const SYSTEM_PROMPT = `You are an AI collaborator watching a shared, real-time whiteboard. People (and possibly other AI passes) sketch diagrams, flows, and notes together in real time. On each turn you're shown the current board as JSON: a map of shape id -> shape data (type, position, and type-specific fields such as text, or a connector's fromShapeId/toShapeId).

Look for genuinely useful improvements only:
- propose_connector: two shapes that are clearly related in meaning but have no arrow between them yet.
- propose_group: several shapes that look like duplicates or an obvious cluster that isn't grouped yet.
- propose_annotation: a short note flagging something clearly missing or worth double-checking near an existing shape (e.g. a gap in a flow).

Call a tool only when you are genuinely confident it's useful. Don't comment on every shape, and don't propose something that's already reflected on the board (an arrow that already connects two shapes, a group that already shares a groupId, etc.). Making zero tool calls is a normal, expected outcome for most passes — most boards most of the time won't need a suggestion. You cannot modify, move, or delete anything; these three tools only add proposals for a human to review.`;

export type ProposeConnectorInput = { fromShapeId: string; toShapeId: string; reason: string };
export type ProposeGroupInput = { shapeIds: string[]; reason: string };
export type ProposeAnnotationInput = { nearShapeId: string; text: string };

export type ToolCall =
  | { name: 'propose_connector'; input: ProposeConnectorInput }
  | { name: 'propose_group'; input: ProposeGroupInput }
  | { name: 'propose_annotation'; input: ProposeAnnotationInput };

function toToolCall(block: Anthropic.ToolUseBlock): ToolCall | null {
  switch (block.name) {
    case 'propose_connector':
      return { name: 'propose_connector', input: block.input as ProposeConnectorInput };
    case 'propose_group':
      return { name: 'propose_group', input: block.input as ProposeGroupInput };
    case 'propose_annotation':
      return { name: 'propose_annotation', input: block.input as ProposeAnnotationInput };
    default:
      return null; // Claude can't call anything else, but stay defensive.
  }
}

// One reasoning pass: serialize the board, ask Claude, return whatever
// proposals it made (possibly none — that's expected, not an error).
export async function runReasoningPass(shapeGraph: ShapeGraph): Promise<ToolCall[]> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages: [{ role: 'user', content: JSON.stringify(shapeGraph) }],
  });

  if (response.stop_reason === 'refusal') {
    console.warn('[reasoning] model declined to respond this pass; treating as no suggestions');
    return [];
  }

  const calls: ToolCall[] = [];
  for (const block of response.content) {
    if (block.type !== 'tool_use') continue;
    const call = toToolCall(block);
    if (call) calls.push(call);
  }
  return calls;
}
