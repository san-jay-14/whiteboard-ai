// Shared presence/awareness wire types + the AI agent's reserved identity,
// used by both the frontend and the agent so they agree on the shape of a
// presence entry and how the agent is distinguished.

// Payload sent via Supabase Presence (channel.track). `kind` marks the AI
// agent; absent/`human` means a normal collaborator.
export type PresencePayload = {
  name: string;
  color: string;
  awarenessClientID: number;
  kind?: 'agent' | 'human';
  // The AI agent republishes its presence with a transient status while a
  // reasoning pass is in flight, so clients can show a "thinking/drawing"
  // indicator. Absent/undefined means idle.
  status?: 'thinking' | 'drawing';
};

// The awareness state each peer publishes (cursor + identity). The agent
// sets kind: 'agent' so clients render it distinctly.
export type AwarenessState = {
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  kind?: 'agent' | 'human';
};

// Reserved identity for the single v1 AI peer (brief section 5). The color
// is deliberately outside the human guest palette in identity.ts.
export const AGENT_NAME = 'AI';
export const AGENT_COLOR = '#7c3aed'; // reserved "assistant" violet
export const AGENT_BROADCAST_ID = 'ai-agent';
