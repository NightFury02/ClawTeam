import type { TaskStatus } from '@/lib/types';

interface TaskConnectionProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  status: TaskStatus;
  taskId: string;
  label?: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  processing: 'var(--color-purple-text, #5e2d91)',
  pending: 'var(--color-blue-text, #003d80)',
  accepted: 'var(--color-blue-text, #003d80)',
  waiting_for_input: 'var(--color-amber-text, #92400e)',
  completed: 'var(--color-green-text, #1a7a1a)',
  failed: 'var(--color-red-text, #a82020)',
  timeout: 'var(--color-red-text, #a82020)',
  cancelled: 'var(--color-text-muted, #86868b)',
};

const ACTIVE_STATUSES = new Set(['processing', 'pending', 'accepted', 'waiting_for_input']);

export function TaskConnection({
  fromX,
  fromY,
  toX,
  toY,
  status,
  taskId,
  label,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: TaskConnectionProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const isActive = ACTIVE_STATUSES.has(status);

  // Bezier control points - curve away from center
  const dx = toX - fromX;
  const dy = toY - fromY;
  const cx1 = fromX + dx * 0.3;
  const cy1 = fromY - Math.abs(dy) * 0.2 - 20;
  const cx2 = fromX + dx * 0.7;
  const cy2 = toY - Math.abs(dy) * 0.2 - 20;

  const pathD = `M${fromX},${fromY} C${cx1},${cy1} ${cx2},${cy2} ${toX},${toY}`;

  // Midpoint for label
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2 - 20;

  const markerId = `arrow-${taskId}`;

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 7"
          refX="10"
          refY="3.5"
          markerWidth="8"
          markerHeight="6"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill={color} opacity={isActive ? 0.7 : 0.3} />
        </marker>
      </defs>

      {/* Hover hit area */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
      />

      {/* Visible line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isActive ? 2 : 1.5}
        markerEnd={`url(#${markerId})`}
        className={isActive ? 'task-connection-active' : 'task-connection-idle'}
      />

      {/* Label */}
      {label && (
        <g>
          <rect
            x={midX - label.length * 3.2}
            y={midY - 8}
            width={label.length * 6.4 + 8}
            height={16}
            rx={4}
            fill="var(--color-card, #ffffff)"
            stroke={color}
            strokeWidth={0.5}
            opacity={0.9}
          />
          <text
            x={midX + 4}
            y={midY + 4}
            textAnchor="middle"
            fill={color}
            fontSize={9}
            fontFamily="sans-serif"
            fontWeight={500}
          >
            {label.length > 16 ? label.slice(0, 15) + '..' : label}
          </text>
        </g>
      )}
    </g>
  );
}
