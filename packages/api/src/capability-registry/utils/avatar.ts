/**
 * Avatar color generation — deterministic color from bot name.
 * Must match the frontend palette in BotAvatar.tsx.
 */

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Generate a deterministic avatar color hex from a bot name */
export function generateAvatarColor(name: string): string {
  return COLORS[hashCode(name) % COLORS.length];
}
