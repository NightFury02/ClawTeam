import { cn } from '@/lib/utils';

interface BotCharacterProps {
  name: string;
  color: string;
  status: 'online' | 'offline' | 'busy' | 'focus_mode';
  isActive: boolean;
  size?: number;
  activeTasks?: number;
  selected?: boolean;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}

export function BotCharacter({
  name,
  color,
  status,
  isActive,
  size = 1,
  activeTasks = 0,
  selected = false,
  onClick,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
}: BotCharacterProps) {
  const isOffline = status === 'offline';
  const isFocus = status === 'focus_mode';
  const w = 60 * size;
  const h = 84 * size;
  const s = size;
  const gradId = `lob-${name.replace(/\W/g, '')}`;

  // openclaw SVG is 120x120, we fit it into ~56x56 area centered in 60x84
  // scale = 56/120 ≈ 0.467, then multiply by size
  const sc = 0.467 * s;
  const ox = 2 * s;   // x offset to center
  const oy = 4 * s;   // y offset (leave room for name below)

  return (
    <g
      className={cn(
        'cursor-pointer transition-opacity',
        isOffline && 'opacity-40',
        !isActive && !isOffline && 'bot-idle',
        isActive && 'bot-active-glow',
      )}
      style={isActive ? { '--glow-color': color + '66' } as React.CSSProperties : undefined}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Gradient def */}
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
        </linearGradient>
      </defs>

      {/* Selected highlight */}
      {selected && (
        <rect
          x={-4 * s} y={-4 * s}
          width={w + 8 * s} height={h + 4 * s}
          rx={10 * s}
          fill="none"
          stroke={color}
          strokeWidth={2.5 * s}
          opacity={0.7}
        />
      )}

      {/* Shadow */}
      <ellipse cx={w / 2} cy={h - 6 * s} rx={18 * s} ry={3.5 * s}
        fill="currentColor" className="text-gray-400" opacity={0.15} />

      {/* OpenClaw body — scaled & translated */}
      <g transform={`translate(${ox},${oy}) scale(${sc})`}>
        {/* Body */}
        <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z"
          fill={`url(#${gradId})`} />
        {/* Left Claw */}
        <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z"
          fill={`url(#${gradId})`}
          className={isActive ? 'bot-arm-working' : ''}
          style={{ transformOrigin: '25px 50px' }} />
        {/* Right Claw */}
        <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z"
          fill={`url(#${gradId})`}
          className={isActive ? 'bot-arm-working' : ''}
          style={{ transformOrigin: '95px 50px', animationDelay: '0.3s' }} />
        {/* Antennae */}
        <path d="M45 15 Q35 5 30 8" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M75 15 Q85 5 90 8" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx="30" cy="8" r="3" fill={color} className="bot-antenna" />
        <circle cx="90" cy="8" r="3" fill={color} className="bot-antenna" />
      </g>

      {/* Face — overlaid at eye positions (scaled coords) */}
      {/* Eye center-left: 45*sc+ox, 35*sc+oy ≈ 23, 20.3 */}
      {/* Eye center-right: 75*sc+ox, 35*sc+oy ≈ 37, 20.3 */}
      {(() => {
        const elx = 45 * sc + ox;
        const erx = 75 * sc + ox;
        const ey = 35 * sc + oy;
        const er = 6 * sc;  // original eye radius
        const pr = 2.5 * sc; // pupil radius

        if (isActive) {
          // Working — eyes open (openclaw original + focus sparkle for focus_mode)
          return (
            <>
              <circle cx={elx} cy={ey} r={er} fill="#050810" />
              <circle cx={erx} cy={ey} r={er} fill="#050810" />
              <circle cx={elx + 1 * sc} cy={ey - 1 * sc} r={pr} fill="#00e5cc" />
              <circle cx={erx + 1 * sc} cy={ey - 1 * sc} r={pr} fill="#00e5cc" />
              {isFocus && (
                <text x={erx + er + 1 * s} y={ey - er} fill="#ffd60a"
                  fontSize={7 * s} fontFamily="sans-serif">★</text>
              )}
            </>
          );
        }
        // Not working — eyes closed
        return (
          <>
            <path d={`M${elx - er} ${ey} Q${elx} ${ey - er} ${elx + er} ${ey}`}
              stroke="#050810" strokeWidth={2 * sc} fill="none" strokeLinecap="round" />
            <path d={`M${erx - er} ${ey} Q${erx} ${ey - er} ${erx + er} ${ey}`}
              stroke="#050810" strokeWidth={2 * sc} fill="none" strokeLinecap="round" />
            {status === 'offline' && (
              <text x={erx + er + 2 * s} y={ey - 2 * s} fill="var(--color-text-muted, #86868b)"
                fontSize={6 * s} fontWeight="bold" fontFamily="sans-serif">zzz</text>
            )}
          </>
        );
      })()}

      {/* Task count badge — top-left */}
      {activeTasks > 0 && (() => {
        const bx = 6 * s;
        const by = 6 * s;
        const br = 7 * s;
        return (
          <g>
            <circle cx={bx} cy={by} r={br} fill="var(--color-primary, #007AFF)" />
            <text x={bx} y={by} textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={8 * s} fontWeight={700} fontFamily="sans-serif">
              {activeTasks > 9 ? '9+' : activeTasks}
            </text>
          </g>
        );
      })()}

      {/* Name label */}
      <text
        x={w / 2} y={h - 2 * s}
        textAnchor="middle" fill="currentColor" className="text-gray-700"
        fontSize={Math.max(9, 10 * s)} fontFamily="sans-serif" fontWeight={500}
      >
        {name.length > 10 ? name.slice(0, 9) + '..' : name}
      </text>
    </g>
  );
}
