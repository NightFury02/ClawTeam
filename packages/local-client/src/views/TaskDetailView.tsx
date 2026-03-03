/**
 * TaskDetailView — Tabbed detail view for a single task
 *
 * Contains four sub-panels: Info, Session, Timeline, Tree
 */

import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { StatusBadge } from '../components/StatusBadge.js';
import { DetailTabs } from '../components/DetailTabs.js';
import type { DetailPanel } from '../components/DetailTabs.js';
import { TaskTimeline } from '../components/TaskTimeline.js';
import { TaskTree } from '../components/TaskTree.js';
import { TaskSessionPanel } from '../components/TaskSessionPanel.js';
import { KeyHint } from '../components/KeyHint.js';
import { BotAvatar } from '../components/BotAvatar.js';
import type { Task } from '../api/types.js';
import type { RouterClient } from '../api/router-client.js';

const PANEL_ORDER: DetailPanel[] = ['info', 'session', 'timeline', 'tree', 'avatar'];

/** Extract the family tree for a given task: root ancestor → all descendants */
function getTaskFamily(allTasks: Task[], focusId: string): Task[] {
  const taskMap = new Map(allTasks.map(t => [t.id, t]));
  const focus = taskMap.get(focusId);
  if (!focus) return [];

  let root = focus;
  while (root.parentTaskId && taskMap.has(root.parentTaskId)) {
    root = taskMap.get(root.parentTaskId)!;
  }

  const family = new Set<string>();
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    family.add(id);
    for (const t of allTasks) {
      if (t.parentTaskId === id && !family.has(t.id)) {
        queue.push(t.id);
      }
    }
  }

  return allTasks.filter(t => family.has(t.id));
}

interface Props {
  task: Task;
  tasks: Task[];
  routerClient: RouterClient;
  onBack: () => void;
}

function InfoPanel({ task }: { task: Task }) {
  return (
    <Box flexDirection="column">
      <Box><Text bold>ID: </Text><Text>{task.id}</Text></Box>
      <Box><Text bold>Status: </Text><StatusBadge status={task.status} /></Box>
      <Box><Text bold>Capability: </Text><Text>{task.capability}</Text></Box>
      <Box><Text bold>Type: </Text><Text>{task.type ?? '-'}</Text></Box>
      <Box><Text bold>From: </Text><Text>{task.fromBotId}</Text></Box>
      <Box><Text bold>To: </Text><Text>{task.toBotId ?? '-'}</Text></Box>
      <Box><Text bold>Priority: </Text><Text>{task.priority}</Text></Box>
      {task.parentTaskId && (
        <Box><Text bold>Parent: </Text><Text>{task.parentTaskId}</Text></Box>
      )}
      <Box><Text bold>Created: </Text><Text>{task.createdAt}</Text></Box>
      {task.acceptedAt && <Box><Text bold>Accepted: </Text><Text>{task.acceptedAt}</Text></Box>}
      {task.startedAt && <Box><Text bold>Started: </Text><Text>{task.startedAt}</Text></Box>}
      {task.completedAt && <Box><Text bold>Completed: </Text><Text>{task.completedAt}</Text></Box>}
      {task.updatedAt && <Box><Text bold>Updated: </Text><Text>{task.updatedAt}</Text></Box>}
      {task.timeoutSeconds != null && (
        <Box><Text bold>Timeout: </Text><Text>{task.timeoutSeconds}s</Text></Box>
      )}
      {task.retryCount != null && (
        <Box><Text bold>Retries: </Text><Text>{task.retryCount}/{task.maxRetries ?? '?'}</Text></Box>
      )}
      {task.senderSessionKey && (
        <Box><Text bold>Sender Session: </Text><Text>{task.senderSessionKey}</Text></Box>
      )}
      {task.executorSessionKey && (
        <Box><Text bold>Executor Session: </Text><Text>{task.executorSessionKey}</Text></Box>
      )}
      {task.parameters && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Parameters:</Text>
          <Text>{JSON.stringify(task.parameters, null, 2)}</Text>
        </Box>
      )}
      {task.result && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Result:</Text>
          <Text color="green">{JSON.stringify(task.result, null, 2)}</Text>
        </Box>
      )}
      {task.error && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Error:</Text>
          <Text color="red">{typeof task.error === 'string' ? task.error : JSON.stringify(task.error, null, 2)}</Text>
        </Box>
      )}
    </Box>
  );
}

export function TaskDetailView({ task, tasks, routerClient, onBack }: Props) {
  const [activePanel, setActivePanel] = useState<DetailPanel>('info');

  const hasSession = !!(task.executorSessionKey || task.senderSessionKey);
  const hasTree = !!task.parentTaskId || tasks.some(t => t.parentTaskId === task.id);

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.tab) {
      const idx = PANEL_ORDER.indexOf(activePanel);
      setActivePanel(PANEL_ORDER[(idx + 1) % PANEL_ORDER.length]);
    }
  });

  function renderPanel() {
    switch (activePanel) {
      case 'info':
        return <InfoPanel task={task} />;
      case 'session': {
        const sessionKey = task.executorSessionKey || task.senderSessionKey;
        if (!sessionKey) return <Text dimColor>No session associated with this task</Text>;
        return <TaskSessionPanel sessionKey={sessionKey} routerClient={routerClient} />;
      }
      case 'timeline':
        return <TaskTimeline task={task} />;
      case 'tree':
        return <TaskTree tasks={getTaskFamily(tasks, task.id)} focusTaskId={task.id} />;
      case 'avatar':
        return (
          <Box>
            <BotAvatar taskStatus={task.status} />
            <Box flexDirection="column" marginLeft={1}>
              <Box><Text dimColor>Task: </Text><Text bold>{task.capability}</Text></Box>
              <Box><Text dimColor>Status: </Text><StatusBadge status={task.status} /></Box>
              <Box><Text dimColor>Executor: </Text><Text>{task.toBotId ?? 'unassigned'}</Text></Box>
            </Box>
          </Box>
        );
    }
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">Task Detail</Text>
        <Text dimColor>  {task.id.slice(0, 12)}...</Text>
      </Box>

      <Box marginTop={1}>
        <DetailTabs activePanel={activePanel} hasSession={hasSession} hasTree={hasTree} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        {renderPanel()}
      </Box>

      <KeyHint hints={[
        { key: 'Tab', label: 'panel' },
        { key: 'Esc', label: 'back' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
