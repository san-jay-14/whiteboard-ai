// No auth wired up yet — every tab gets a random guest identity for its
// awareness/presence state until real user identity exists.
const COLORS = [
  '#f97316', // orange
  '#22c55e', // green
  '#3b82f6', // blue
  '#ec4899', // pink
  '#eab308', // yellow
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ef4444', // red
];

export type LocalUser = {
  name: string;
  color: string;
};

export function createLocalUser(): LocalUser {
  const name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { name, color };
}
