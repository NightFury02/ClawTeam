import type { TaskStatus } from '@/lib/types';

export type InteractionType =
  | 'delegate'
  | 'direct_message'
  | 'task_notification'
  | 'broadcast'
  | 'human_input'
  | 'system'
  | 'task_continuation';

interface BotConnectionProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  interactionType: InteractionType;
  connectionId: string;
  /** Only used when interactionType === 'delegate' */
  status?: TaskStatus;
  label?: string;
  isInternal?: boolean;
  fadeOpacity?: number;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}

// Status colors for delegate (task) connections
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

// Fixed colors for non-delegate interaction types
const INTERACTION_COLORS: Record<string, string> = {
  direct_message: '#0ea5e9',
  task_notification: '#d97706',
  broadcast: '#6b7280',
  human_input: '#ea580c',
  system: '#9ca3af',
  task_continuation: '#7c3aed',
};

const ACTIVE_STATUSES = new Set(['processing', 'pending', 'accepted', 'waiting_for_input']);

interface LineStyle {
  strokeWidth: number;
  dashArray?: string;
  className: string;
  arrowSize: number;
  arrowOpacity: number;
}

function getLineStyle(interactionType: InteractionType, isInternal: boolean, status?: TaskStatus): LineStyle {
  if (interactionType === 'delegate') {
    const isActive = status ? ACTIVE_STATUSES.has(status) : false;
    if (isInternal) {
      return {
        strokeWidth: isActive ? 1.2 : 1,
        dashArray: isActive ? '6 4' : '4 6',
        className: isActive ? 'task-connection-internal-active' : 'task-connection-idle',
        arrowSize: 6,
        arrowOpacity: isActive ? 0.5 : 0.2,
      };
    }
    return {
      strokeWidth: isActive ? 2.5 : 1.5,
      dashArray: undefined,
      className: isActive ? 'task-connection-active' : 'task-connection-idle',
      arrowSize: 8,
      arrowOpacity: isActive ? 0.7 : 0.3,
    };
  }

  const internalScale = isInternal ? 0.7 : 1;

  switch (interactionType) {
    case 'direct_message':
      return {
        strokeWidth: 1.5 * internalScale,
        dashArray: undefined,
        className: 'connection-direct-message',
        arrowSize: isInternal ? 5 : 7,
        arrowOpacity: isInternal ? 0.4 : 0.6,
      };
    case 'task_notification':
      return {
        strokeWidth: 1 * internalScale,
        dashArray: '4 3',
        className: 'connection-task-notification',
        arrowSize: isInternal ? 4 : 6,
        arrowOpacity: isInternal ? 0.3 : 0.5,
      };
    case 'broadcast':
      return {
        strokeWidth: 1 * internalScale,
        dashArray: '2 4',
        className: 'connection-broadcast',
        arrowSize: isInternal ? 4 : 5,
        arrowOpacity: isInternal ? 0.25 : 0.4,
      };
    case 'human_input':
      return {
        strokeWidth: 1.5 * internalScale,
        dashArray: '6 3',
        className: 'connection-human-input',
        arrowSize: isInternal ? 5 : 7,
        arrowOpacity: isInternal ? 0.4 : 0.6,
      };
    case 'system':
      return {
        strokeWidth: 1 * internalScale,
        dashArray: '2 4',
        className: 'connection-system',
        arrowSize: isInternal ? 4 : 5,
        arrowOpacity: isInternal ? 0.2 : 0.35,
      };
    case 'task_continuation':
      return {
        strokeWidth: 1.5 * internalScale,
        dashArray: '6 3',
        className: 'connection-task-continuation',
        arrowSize: isInternal ? 5 : 7,
        arrowOpacity: isInternal ? 0.4 : 0.6,
      };
  }
}

export function BotConnection({
  fromX,
  fromY,
  toX,
  toY,
  interactionType,
  connectionId,
  status,
  label,
  isInternal = false,
  fadeOpacity,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: BotConnectionProps) {
  // Determine color
  const color =
    interactionType === 'delegate'
      ? STATUS_COLORS[status || 'pending'] || STATUS_COLORS.pending
      : INTERACTION_COLORS[interactionType];

  const lineStyle = getLineStyle(interactionType, isInternal, status);
  const isFading = fadeOpacity !== undefined && fadeOpacity < 1;

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

  const markerId = `arrow-${connectionId}`;

  const groupOpacity = isInternal && interactionType !== 'delegate'
    ? (fadeOpacity ?? 0.6)
    : (fadeOpacity ?? 1);

  return (
    <g
      className="cursor-pointer"
      style={isFading ? { opacity: groupOpacity, transition: 'opacity 0.2s ease-out' } : { opacity: groupOpacity }}
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
          markerWidth={lineStyle.arrowSize}
          markerHeight={lineStyle.arrowSize * 0.75}
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill={color} opacity={lineStyle.arrowOpacity} />
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
        strokeWidth={lineStyle.strokeWidth}
        strokeDasharray={lineStyle.dashArray}
        markerEnd={`url(#${markerId})`}
        className={lineStyle.className}
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
