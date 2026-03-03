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

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Fallback color based on id hash */
function fallbackColor(id: string): string {
  return COLORS[hashCode(id) % COLORS.length];
}

/** Map bot status to CSS ring class */
const statusRingClass: Record<string, string> = {
  online: 'avatar-ring avatar-ring-online',
  busy: 'avatar-ring avatar-ring-busy',
  offline: 'avatar-ring avatar-ring-offline',
  focus_mode: 'avatar-ring avatar-ring-busy',
  processing: 'avatar-ring avatar-ring-processing',
};

interface BotAvatarProps {
  name: string;
  id?: string;
  avatarColor?: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

export function BotAvatar({ name, id, avatarColor, avatarUrl, size = 'md', status }: BotAvatarProps) {
  const color = avatarColor || fallbackColor(id || name);
  const initials = getInitials(name || '??');
  const ringClass = status ? (statusRingClass[status] || '') : '';

  if (avatarUrl) {
    return (
      <div className={`relative shrink-0 ${ringClass}`}>
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover transition-transform hover:scale-105`}
          title={name}
        />
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 ${ringClass}`}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-semibold transition-transform hover:scale-105`}
        style={{ backgroundColor: color }}
        title={name}
      >
        {initials}
      </div>
    </div>
  );
}

interface TaskFlowProps {
  fromName: string;
  fromId?: string;
  fromAvatarColor?: string;
  fromAvatarUrl?: string;
  toName: string;
  toId?: string;
  toAvatarColor?: string;
  toAvatarUrl?: string;
  size?: 'sm' | 'md';
}

export function TaskFlow({ fromName, fromId, fromAvatarColor, fromAvatarUrl, toName, toId, toAvatarColor, toAvatarUrl, size = 'sm' }: TaskFlowProps) {
  return (
    <div className="flex items-center gap-1.5">
      <BotAvatar name={fromName} id={fromId} avatarColor={fromAvatarColor} avatarUrl={fromAvatarUrl} size={size} />
      <span className="text-gray-400 text-xs">→</span>
      <BotAvatar name={toName} id={toId} avatarColor={toAvatarColor} avatarUrl={toAvatarUrl} size={size} />
    </div>
  );
}
