import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listBoards, getShapeGraph } from './supabase.js';
import { shapeGraphToSvg } from './render/svg.js';
import { svgToPngBase64 } from './render/png.js';

// Local, single-user, stdio MCP server exposing the whiteboard to Claude
// Desktop (brief section 6). stdout is the protocol channel — never write to
// it; diagnostics go to stderr.
const server = new McpServer({ name: 'whiteboard-mcp', version: '0.1.0' });

server.registerTool(
  'list_boards',
  {
    title: 'List boards',
    description: 'List all whiteboard boards as [{ id, name, updated_at }], most recently updated first.',
  },
  async () => {
    const boards = await listBoards();
    return { content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }] };
  },
);

server.registerTool(
  'get_board',
  {
    title: 'Get board shape graph',
    description:
      'Return the structured shape graph (the exact JSON from board_snapshots.shape_graph) for a board_id — an object keyed by shape id.',
    inputSchema: { board_id: z.string().describe('The board id (uuid).') },
  },
  async ({ board_id }) => {
    const graph = await getShapeGraph(board_id);
    if (graph === null) {
      return {
        content: [{ type: 'text', text: `No snapshot found for board ${board_id}.` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
  },
);

server.registerTool(
  'get_board_snapshot_image',
  {
    title: 'Render board to image',
    description:
      "Render a board's current shapes to a PNG (server-side, from the same shape model the frontend draws) so you can visually inspect the sketch.",
    inputSchema: { board_id: z.string().describe('The board id (uuid).') },
  },
  async ({ board_id }) => {
    const graph = await getShapeGraph(board_id);
    if (graph === null) {
      return {
        content: [{ type: 'text', text: `No snapshot found for board ${board_id}.` }],
        isError: true,
      };
    }
    const svg = shapeGraphToSvg(graph);
    const data = svgToPngBase64(svg);
    return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
