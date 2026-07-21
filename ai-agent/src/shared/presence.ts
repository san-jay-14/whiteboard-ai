// VENDORED COPY of /shared/presence.ts — see shared/transport.ts here for why.
// Mirror any change to /shared/presence.ts so the agent and frontend agree on
// presence/awareness shapes and the AI's reserved identity.

// Payload sent via Supabase Presence (channel.track). `kind` marks the AI
// agent; absent/`human` means a normal collaborator.
export type PresencePayload = {
  name: string;
  color: string;
  awarenessClientID: number;
  kind?: 'agent' | 'human';
  // Transient status the agent republishes during a reasoning pass so clients
  // can show a "thinking/drawing" indicator. Absent/undefined means idle.
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
