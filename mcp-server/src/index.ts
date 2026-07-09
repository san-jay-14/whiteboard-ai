import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listBoards, getShapeGraph } from './supabase.js';
import { shapeGraphToSvg } from './render/svg.js';
import { svgToPngBase64 } from './render/png.js';
import { savePng } from './render/save.js';

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
    // Save + open locally so a human using Claude Desktop can actually see
    // it (Claude Desktop doesn't render MCP image blocks inline); the image
    // block is still returned so the model can visually reason about it.
    const saved = savePng(data, board_id);
    return {
      content: [
        { type: 'image', data, mimeType: 'image/png' },
        {
          type: 'text',
          text: saved.opened
            ? `Snapshot saved to ${saved.path} and opened in your default image viewer.`
            : `Snapshot saved to ${saved.path}.`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
