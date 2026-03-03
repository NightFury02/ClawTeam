/**
 * TaskTree — Task relationship tree using parentTaskId
 */

import React from 'react';
import { Text, Box } from 'ink';
import type { Task } from '../api/types.js';

const STATUS_ICONS: Record<string, string> = {
  pending: '◔',
  accepted: '◑',
  processing: '●',
  completed: '✔',
  failed: '✘',
  cancelled: '○',
  timeout: '⏱',
};

interface Props {
  tasks: Task[];
  focusTaskId: string;
}

interface TreeNode {
  task: Task;
  children: TreeNode[];
}

function buildTree(tasks: Task[]): TreeNode[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const childrenMap = new Map<string, Task[]>();

  for (const t of tasks) {
    if (t.parentTaskId) {
      const siblings = childrenMap.get(t.parentTaskId) ?? [];
      siblings.push(t);
      childrenMap.set(t.parentTaskId, siblings);
    }
  }

  function toNode(task: Task): TreeNode {
    const children = (childrenMap.get(task.id) ?? []).map(toNode);
    return { task, children };
  }

  // Root nodes: tasks whose parent is not in the task list
  const roots = tasks.filter(t => !t.parentTaskId || !taskMap.has(t.parentTaskId));
  return roots.map(toNode);
}

function renderNode(
  node: TreeNode,
  focusTaskId: string,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
): React.ReactNode[] {
  const icon = STATUS_ICONS[node.task.status] ?? '?';
  const isFocus = node.task.id === focusTaskId;
  const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
  const label = `${icon} ${node.task.id.slice(0, 8)} ${node.task.capability} (${node.task.status})`;

  const lines: React.ReactNode[] = [
    <Box key={node.task.id}>
      <Text dimColor>{prefix}{connector}</Text>
      <Text inverse={isFocus} bold={isFocus}>{label}</Text>
    </Box>,
  ];

  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');

  node.children.forEach((child, i) => {
    const childIsLast = i === node.children.length - 1;
    lines.push(...renderNode(child, focusTaskId, childPrefix, childIsLast, false));
  });

  return lines;
}

export function TaskTree({ tasks, focusTaskId }: Props) {
  if (tasks.length === 0) {
    return <Text dimColor>No tasks to display</Text>;
  }

  const roots = buildTree(tasks);

  // Check if the focus task's parent is missing
  const focusTask = tasks.find(t => t.id === focusTaskId);
  const parentMissing = focusTask?.parentTaskId && !tasks.find(t => t.id === focusTask.parentTaskId);

  return (
    <Box flexDirection="column">
      {parentMissing && (
        <Text dimColor>[parent {focusTask!.parentTaskId!.slice(0, 8)}... not loaded]</Text>
      )}
      {roots.map((root, i) =>
        renderNode(root, focusTaskId, '', i === roots.length - 1, true)
      )}
    </Box>
  );
}
