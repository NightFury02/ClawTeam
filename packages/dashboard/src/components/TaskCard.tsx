import { Task } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { TaskActions } from './TaskActions';
import { TaskFlow } from './BotAvatar';
import { formatDate, formatDuration } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const typeBadgeColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  'sub-task': 'bg-purple-100 text-purple-800',
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const duration =
    task.startedAt && task.completedAt
      ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
      : null;

  const taskType = task.type || 'new';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-6 card-hover card-gradient cursor-pointer"
    >
      {/* Header: capability, status, priority, type */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-900">{task.title || task.prompt || task.capability || 'Task'}</h3>
            {task.title && task.capability !== 'general' && <span className="text-sm text-gray-500">{task.capability}</span>}
            {!task.title && task.prompt && (
              <p className="text-sm text-gray-500 truncate max-w-md">{task.prompt.length > 80 ? task.prompt.slice(0, 80) + '...' : task.prompt}</p>
            )}
            <StatusBadge status={task.status} />
            <StatusBadge status={task.priority} />
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColors[taskType] || 'bg-gray-100 text-gray-800'}`}
            >
              {taskType}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Task ID: <code className="font-mono bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded text-xs">{task.id}</code>
          </p>
        </div>
      </div>

      {/* From → To bot flow */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-3">
          <TaskFlow
            fromName={task.fromBotName || task.fromBotId}
            fromId={task.fromBotId}
            fromAvatarColor={task.fromAvatarColor}
            fromAvatarUrl={task.fromAvatarUrl}
            toName={task.toBotName || task.toBotId}
            toId={task.toBotId}
            toAvatarColor={task.toAvatarColor}
            toAvatarUrl={task.toAvatarUrl}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-900 truncate">
              {task.fromBotName || task.fromBotId.slice(0, 8)} → {task.toBotName || task.toBotId.slice(0, 8)}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {task.senderSessionKey && <span>session: {task.senderSessionKey} </span>}
              {task.executorSessionKey && <span>→ {task.executorSessionKey}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Task chain info (sub-task) */}
      {task.parentTaskId && (
        <div className="mb-3 px-3 py-2 bg-purple-50 rounded text-sm">
          <span className="text-purple-700">Parent Task: </span>
          <code className="font-mono text-purple-900 text-xs">{task.parentTaskId}</code>
        </div>
      )}

      {/* Parameters */}
      {Object.keys(task.parameters || {}).length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Parameters</h4>
          <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto max-h-32">
            {JSON.stringify(task.parameters, null, 2)}
          </pre>
        </div>
      )}

      {/* Result */}
      {task.result !== undefined && task.result !== null && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Result</h4>
          <pre className="bg-green-50 rounded p-2 text-xs overflow-x-auto max-h-32">
            {typeof task.result === 'object' ? JSON.stringify(task.result, null, 2) : String(task.result)}
          </pre>
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-red-700 mb-2">Error</h4>
          <pre className="bg-red-50 rounded p-2 text-xs text-red-800 max-h-32 overflow-x-auto">
            {typeof task.error === 'object' ? JSON.stringify(task.error, null, 2) : String(task.error)}
          </pre>
        </div>
      )}

      {/* Timestamps */}
      <div className="text-xs text-gray-500 space-y-1 mb-3">
        <p>Created: {formatDate(task.createdAt)}</p>
        {task.startedAt && <p>Started: {formatDate(task.startedAt)}</p>}
        {task.completedAt && <p>Completed: {formatDate(task.completedAt)}</p>}
        {duration !== null && <p>Duration: {formatDuration(duration)}</p>}
      </div>

      {/* Actions */}
      <TaskActions task={task} />
    </div>
  );
}
