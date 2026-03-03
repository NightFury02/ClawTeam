import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Task, Message } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { TaskFlow, BotAvatar } from './BotAvatar';
import { formatDate } from '@/lib/utils';

interface TaskTimelineProps {
  focusTaskId: string;
  tasks: Task[];
  messages: Message[];
  /** Called when the right-side detail panel opens or closes */
  onPanelChange?: (open: boolean) => void;
}

/* ---------- helpers ---------- */

type ActivityItem =
  | { kind: 'task'; createdAt: string; task: Task; children: ActivityItem[] }
  | { kind: 'message'; createdAt: string; message: Message };

const typeBadgeColors: Record<string, string> = {
  direct_message: 'bg-blue-100 text-blue-800',
  task_notification: 'bg-purple-100 text-purple-800',
  broadcast: 'bg-green-100 text-green-800',
  system: 'bg-gray-100 text-gray-800',
  human_input_request: 'bg-amber-100 text-amber-800',
  human_input_response: 'bg-emerald-100 text-emerald-800',
  task_continuation: 'bg-green-100 text-green-800',
};

/** Map task.type to action label */
function taskActionLabel(type?: string): { label: string; className: string } {
  if (type === 'sub-task') return { label: 'SUB-TASK', className: 'bg-indigo-50 text-indigo-700' };
  return { label: 'DELEGATE', className: 'bg-blue-50 text-blue-700' };
}

/** Map message.type to action label */
const msgActionLabels: Record<string, { label: string; className: string }> = {
  direct_message:       { label: 'DM',            className: 'bg-blue-50 text-blue-700 border-blue-200' },
  task_notification:    { label: 'NOTIFY',         className: 'bg-purple-50 text-purple-700 border-purple-200' },
  broadcast:            { label: 'BROADCAST',      className: 'bg-green-50 text-green-700 border-green-200' },
  system:               { label: 'SYSTEM',         className: 'bg-gray-50 text-gray-700 border-gray-200' },
  human_input_request:  { label: 'HUMAN REQUEST',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  human_input_response: { label: 'HUMAN REPLY',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  task_continuation:    { label: 'CONTINUE',       className: 'bg-green-50 text-green-700 border-green-200' },
};

function renderContent(content: any): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && parsed.text) return parsed.text;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  }
  if (typeof content === 'object' && content.text) return content.text;
  return JSON.stringify(content, null, 2);
}

function summarize(value: unknown, maxLen = 120): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function ts(dateStr: string) {
  return new Date(dateStr).getTime();
}

/* ---------- tree builder ---------- */

function buildActivityTree(
  taskId: string,
  taskMap: Map<string, Task>,
  childrenMap: Map<string, string[]>,
  msgByTask: Map<string, Message[]>,
  depth: number,
): ActivityItem | null {
  if (depth > 20) return null;
  const task = taskMap.get(taskId);
  if (!task) return null;

  const children: ActivityItem[] = [];
  const childIds = childrenMap.get(taskId) || [];
  for (const cid of childIds) {
    const node = buildActivityTree(cid, taskMap, childrenMap, msgByTask, depth + 1);
    if (node) children.push(node);
  }
  const msgs = msgByTask.get(taskId) || [];
  for (const m of msgs) {
    children.push({ kind: 'message', createdAt: m.createdAt, message: m });
  }
  children.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));

  return { kind: 'task', createdAt: task.createdAt, task, children };
}

function collectPathIds(
  root: ActivityItem,
  targetId: string,
  path: string[] = [],
): string[] | null {
  if (root.kind !== 'task') return null;
  const current = [...path, root.task.id];
  if (root.task.id === targetId) return current;
  for (const child of root.children) {
    const found = collectPathIds(child, targetId, current);
    if (found) return found;
  }
  return null;
}

/* ---------- icons ---------- */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ---------- detail panel ---------- */

function MessageDetailPanel({ msg, onClose }: { msg: Message; onClose: () => void }) {
  const contentText = renderContent(msg.content);

  return (
    <div className="w-80 shrink-0 rounded-xl bg-white overflow-hidden flex flex-col self-start sticky top-24 card-gradient">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-green-50">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
            MSG
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColors[msg.type] || 'bg-gray-100 text-gray-800'}`}
          >
            {msg.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-green-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={msg.priority} />
          <StatusBadge status={msg.status} />
        </div>

        {/* From → To */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BotAvatar
              name={msg.fromBotName || msg.fromBotId}
              id={msg.fromBotId}
              avatarColor={msg.fromAvatarColor}
              avatarUrl={msg.fromAvatarUrl}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{msg.fromBotName || msg.fromBotId}</p>
              <p className="text-[10px] text-gray-400">From</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BotAvatar
              name={msg.toBotName || msg.toBotId}
              id={msg.toBotId}
              avatarColor={msg.toAvatarColor}
              avatarUrl={msg.toAvatarUrl}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{msg.toBotName || msg.toBotId}</p>
              <p className="text-[10px] text-gray-400">To</p>
            </div>
          </div>
        </div>

        {/* IDs */}
        <div className="space-y-1.5 text-xs">
          <div>
            <span className="text-gray-500">Message ID</span>
            <p className="font-mono bg-gray-50 px-2 py-1 rounded text-gray-700 mt-0.5 break-all">{msg.messageId}</p>
          </div>
          <div>
            <span className="text-gray-500">Trace ID</span>
            <p className="font-mono bg-gray-50 px-2 py-1 rounded text-gray-700 mt-0.5 break-all">{msg.traceId}</p>
          </div>
          <div>
            <span className="text-gray-500">Content Type</span>
            <p className="font-mono bg-gray-50 px-2 py-1 rounded text-gray-700 mt-0.5">{msg.contentType}</p>
          </div>
        </div>

        {/* Content */}
        {contentText && (
          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-1">Content</h4>
            <pre className="bg-gray-50 rounded p-2 text-xs overflow-x-auto max-h-56 whitespace-pre-wrap break-words">
              {contentText}
            </pre>
          </div>
        )}

        {/* Linked task */}
        {msg.taskId && (
          <div>
            <span className="text-xs text-gray-500">Linked Task</span>
            <p className="mt-0.5">
              <Link to={`/tasks/${msg.taskId}`} className="font-mono text-xs text-purple-700 hover:underline bg-purple-50 px-2 py-1 rounded inline-block break-all">
                {msg.taskId}
              </Link>
            </p>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
          <p>Created: {formatDate(msg.createdAt)}</p>
          {msg.readAt && <p>Read: {formatDate(msg.readAt)}</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export function TaskTimeline({ focusTaskId, tasks, messages, onPanelChange }: TaskTimelineProps) {
  const navigate = useNavigate();

  const tree = useMemo(() => {
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    let rootId = focusTaskId;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(rootId)) break;
      visited.add(rootId);
      const t = taskMap.get(rootId);
      if (!t?.parentTaskId || !taskMap.has(t.parentTaskId)) break;
      rootId = t.parentTaskId;
    }

    const childrenMap = new Map<string, string[]>();
    for (const t of tasks) {
      if (t.parentTaskId && taskMap.has(t.parentTaskId)) {
        const arr = childrenMap.get(t.parentTaskId) || [];
        arr.push(t.id);
        childrenMap.set(t.parentTaskId, arr);
      }
    }

    const msgByTask = new Map<string, Message[]>();
    for (const m of messages) {
      if (m.taskId) {
        const arr = msgByTask.get(m.taskId) || [];
        arr.push(m);
        msgByTask.set(m.taskId, arr);
      }
    }

    return buildActivityTree(rootId, taskMap, childrenMap, msgByTask, 0);
  }, [focusTaskId, tasks, messages]);

  const initialExpanded = useMemo(() => {
    if (!tree || tree.kind !== 'task') return new Set<string>();
    const path = collectPathIds(tree, focusTaskId) || [];
    return new Set(path);
  }, [tree, focusTaskId]);

  const [toggledTasks, setToggledTasks] = useState<Set<string>>(new Set());
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  // Build a lookup for all messages in the tree so we can find the selected one
  const msgMap = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.messageId, m);
    return map;
  }, [messages]);

  const selectedMsg = selectedMsgId ? msgMap.get(selectedMsgId) ?? null : null;

  useEffect(() => {
    onPanelChange?.(selectedMsg !== null);
  }, [selectedMsg, onPanelChange]);

  const isTaskExpanded = useCallback(
    (taskId: string) => {
      const defaultExpanded = initialExpanded.has(taskId);
      return toggledTasks.has(taskId) ? !defaultExpanded : defaultExpanded;
    },
    [toggledTasks, initialExpanded],
  );

  const toggleTask = useCallback((taskId: string) => {
    setToggledTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectMsg = useCallback((msgId: string) => {
    setSelectedMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  if (!tree) {
    return <p className="text-sm text-gray-400">No activity data</p>;
  }

  /* ---------- render tree nodes ---------- */

  function renderTaskNode(item: ActivityItem & { kind: 'task' }, depth: number) {
    const { task, children } = item;
    const isFocus = task.id === focusTaskId;
    const indent = depth * 24;
    const hasChildren = children.length > 0;
    const expanded = isTaskExpanded(task.id);

    return (
      <div key={`t-${task.id}`}>
        <div
          className={`relative flex items-start gap-2 py-2 px-3 rounded-lg transition-colors ${
            isFocus
              ? 'bg-blue-50'
              : 'hover:bg-gray-50'
          }`}
          style={{ marginLeft: indent }}
        >
          {/* Collapse toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleTask(task.id);
            }}
            className={`mt-1 shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
              hasChildren
                ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200 cursor-pointer'
                : 'text-transparent cursor-default'
            }`}
          >
            {hasChildren && <ChevronIcon expanded={expanded} />}
          </button>

          {/* Dot */}
          <div className="flex flex-col items-center pt-1 shrink-0">
            <div className={`w-3 h-3 rounded-full border-2 ${
              isFocus ? 'bg-blue-500 border-blue-300' : 'bg-blue-400 border-blue-200'
            }`} />
            {hasChildren && expanded && (
              <div className="w-0.5 flex-1 bg-gray-200 mt-0.5" />
            )}
          </div>

          {/* Content */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => navigate(`/tasks/${task.id}`)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {(() => { const action = taskActionLabel(task.type); return (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${action.className}`}>
                {action.label}
              </span>
              ); })()}
              <span className="font-medium text-gray-900 text-sm truncate">{task.title || (task.prompt ? (task.prompt.length > 40 ? task.prompt.slice(0, 40) + '...' : task.prompt) : task.capability) || 'Task'}</span>
              <StatusBadge status={task.status} />
              <StatusBadge status={task.priority} />
              {hasChildren && (
                <span className="text-[10px] text-gray-400">({children.length})</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <TaskFlow
                fromName={task.fromBotName || task.fromBotId}
                fromId={task.fromBotId}
                fromAvatarColor={task.fromAvatarColor}
                fromAvatarUrl={task.fromAvatarUrl}
                toName={task.toBotName || task.toBotId}
                toId={task.toBotId}
                toAvatarColor={task.toAvatarColor}
                toAvatarUrl={task.toAvatarUrl}
                size="sm"
              />
              <span className="text-xs text-gray-500 truncate">
                {task.fromBotName || task.fromBotId.slice(0, 8)} → {task.toBotName || task.toBotId.slice(0, 8)}
              </span>
            </div>
            {Object.keys(task.parameters || {}).length > 0 && (
              <p className="text-xs text-gray-500 truncate mt-1">Params: {summarize(task.parameters)}</p>
            )}
            {task.error && (
              <p className="text-xs text-red-600 truncate mt-1">Error: {summarize(task.error)}</p>
            )}
            {!task.error && task.result !== undefined && task.result !== null && (
              <p className="text-xs text-green-700 truncate mt-1">Result: {summarize(task.result)}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">{formatDate(task.createdAt)}</p>
          </div>
        </div>

        {hasChildren && expanded && (
          <div className="relative" style={{ marginLeft: indent + 18 }}>
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="pl-4 space-y-1 py-1">
              {children.map((child) =>
                child.kind === 'task'
                  ? renderTaskNode(child, 0)
                  : renderMessageNode(child)
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMessageNode(item: ActivityItem & { kind: 'message' }) {
    const { message: msg } = item;
    const contentText = renderContent(msg.content);
    const isSelected = selectedMsgId === msg.messageId;

    // Determine dot color based on message type
    const isHumanRequest = msg.type === 'human_input_request';
    const isHumanResponse = msg.type === 'human_input_response';
    const isHumanEvent = isHumanRequest || isHumanResponse;
    const dotColor = isSelected
      ? (isHumanRequest ? 'bg-amber-500 border-amber-300' : isHumanResponse ? 'bg-emerald-500 border-emerald-300' : 'bg-green-500 border-green-300')
      : (isHumanRequest ? 'bg-amber-400 border-amber-200' : isHumanResponse ? 'bg-emerald-400 border-emerald-200' : 'bg-green-400 border-green-200');
    const selectedBg = isHumanRequest ? 'bg-amber-50 ring-1 ring-amber-300' : isHumanResponse ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'bg-green-50 ring-1 ring-green-300';

    const actionBadge = msgActionLabels[msg.type] || { label: 'MSG', className: 'bg-green-50 text-green-700 border-green-200' };

    return (
      <div
        key={`m-${msg.messageId}`}
        onClick={() => selectMsg(msg.messageId)}
        className={`relative flex items-start gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
          isSelected ? selectedBg : 'hover:bg-gray-50'
        }`}
      >
        {/* Dot */}
        <div className="flex flex-col items-center pt-1 shrink-0">
          <div className={`w-3 h-3 rounded-full border-2 ${dotColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${actionBadge.className}`}>
              {actionBadge.label}
            </span>
            <StatusBadge status={msg.priority} />
            <StatusBadge status={msg.status} />
          </div>
          {/* Show TaskFlow only for regular messages, not human-in-the-loop events */}
          {!isHumanEvent && (
            <div className="flex items-center gap-3 mt-1">
              <TaskFlow
                fromName={msg.fromBotName || msg.fromBotId}
                fromId={msg.fromBotId}
                fromAvatarColor={msg.fromAvatarColor}
                fromAvatarUrl={msg.fromAvatarUrl}
                toName={msg.toBotName || msg.toBotId}
                toId={msg.toBotId}
                toAvatarColor={msg.toAvatarColor}
                toAvatarUrl={msg.toAvatarUrl}
                size="sm"
              />
              <span className="text-xs text-gray-500 truncate">
                {msg.fromBotName || msg.fromBotId.slice(0, 8)} → {msg.toBotName || msg.toBotId.slice(0, 8)}
              </span>
            </div>
          )}
          {contentText && (
            <p className="text-xs text-gray-600 truncate mt-1">
              {contentText.length > 150 ? contentText.slice(0, 150) + '...' : contentText}
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">{formatDate(msg.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (tree.kind !== 'task') return null;

  // Skip the root node (the task itself) and render its children directly
  const topLevelItems = tree.children;

  return (
    <div className="flex gap-4">
      {/* Tree */}
      <div className={`space-y-1 min-w-0 ${selectedMsg ? 'flex-1' : 'w-full'}`}>
        {topLevelItems.length === 0 ? (
          <p className="text-sm text-gray-400 py-2 px-3">No activity yet</p>
        ) : (
          topLevelItems.map((item) =>
            item.kind === 'task'
              ? renderTaskNode(item, 0)
              : renderMessageNode(item)
          )
        )}
      </div>

      {/* Right-side detail panel */}
      {selectedMsg && (
        <MessageDetailPanel
          msg={selectedMsg}
          onClose={() => setSelectedMsgId(null)}
        />
      )}
    </div>
  );
}
