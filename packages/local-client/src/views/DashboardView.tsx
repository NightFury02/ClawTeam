/**
 * DashboardView — Kanban-style task dashboard with tabbed columns
 *
 * Split layout: compact task list on top, tabbed detail panel below.
 * Bottom panel shows Info/Session/Timeline/Tree for the selected task.
 * Columns use flexGrow to adapt to terminal width.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';
import { useTasks } from '../hooks/useTasks.js';
import { useBots } from '../hooks/useBots.js';
import { useSessions } from '../hooks/useSessions.js';
import { useConfig } from '../hooks/useConfig.js';
import { ColumnTabs } from '../components/ColumnTabs.js';
import { TaskRow } from '../components/TaskRow.js';
import { DetailTabs, type DetailPanel } from '../components/DetailTabs.js';
import { TaskTimeline } from '../components/TaskTimeline.js';
import { TaskTree } from '../components/TaskTree.js';
import { TaskSessionPanel } from '../components/TaskSessionPanel.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { BotAvatar, resolveAvatarStatus } from '../components/BotAvatar.js';
import { KeyHint } from '../components/KeyHint.js';
import { DelegateForm } from '../components/DelegateForm.js';
import { Spinner } from '../components/Spinner.js';
import { TaskDetailView } from './TaskDetailView.js';
import type { ColumnId, SessionState, Task } from '../api/types.js';

const COLUMN_ORDER: ColumnId[] = ['pending', 'processing', 'waiting', 'completed', 'failed'];
const COLUMN_LABELS: Record<ColumnId, string> = {
  pending: 'Pending',
  processing: 'Processing',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
};
const PANEL_ORDER: DetailPanel[] = ['info', 'session', 'timeline', 'tree', 'avatar'];

type SubView = 'list' | 'detail' | 'delegate' | 'nudge-confirm';

/**
 * Lines consumed by the list-view chrome (everything except task rows):
 *   title(1) + margin(1) + columnTabs(1) + margin(1) + separator(1) + tableHeader(1)
 *   + margin(1) + panelSep(1) + detailTabs(1) + margin(1) + detailContent(8)
 *   + message(1) + keyHints(1)
 */
const LIST_CHROME_LINES = 20;

/** Extract the family tree for a given task: root ancestor → all descendants */
function getTaskFamily(allTasks: Task[], focusId: string): Task[] {
  const taskMap = new Map(allTasks.map(t => [t.id, t]));
  const focus = taskMap.get(focusId);
  if (!focus) return [];

  // Walk up to find root ancestor
  let root = focus;
  while (root.parentTaskId && taskMap.has(root.parentTaskId)) {
    root = taskMap.get(root.parentTaskId)!;
  }

  // Collect all descendants from root via BFS
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

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour12: false });
}

/** Info panel — basic task fields */
function InfoPanel({ task, sessionState, termWidth }: {
  task: Task;
  sessionState: SessionState | null;
  termWidth: number;
}) {
  const LABEL_W = 20;

  return (
    <Box flexDirection="column" width="100%">
      <Box>
        <Box width={LABEL_W}><Text dimColor>ID</Text></Box>
        <Text>{task.id}</Text>
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>Name</Text></Box>
        <Text bold>{task.capability}</Text>
        {task.type && <Text dimColor>  ({task.type})</Text>}
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>From → To</Text></Box>
        <Text>{task.fromBotId}</Text>
        <Text dimColor>{' → '}</Text>
        <Text>{task.toBotId ?? '-'}</Text>
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>Sender Session</Text></Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate">{task.senderSessionKey ?? '-'}</Text>
        </Box>
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>Executor Session</Text></Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate">{task.executorSessionKey ?? '-'}</Text>
        </Box>
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>Session State</Text></Box>
        {sessionState ? (
          <StatusBadge status={sessionState} />
        ) : task.executorSessionKey ? (
          <Text dimColor>unavailable</Text>
        ) : (
          <Text dimColor>-</Text>
        )}
      </Box>
      <Box>
        <Box width={LABEL_W}><Text dimColor>Updated</Text></Box>
        <Text>{formatTime(task.updatedAt)}</Text>
      </Box>
      {task.error && (
        <Box>
          <Box width={LABEL_W}><Text dimColor>Error</Text></Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text color="red" wrap="truncate">
              {typeof task.error === 'string' ? task.error : JSON.stringify(task.error)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function DashboardView({ maxHeight }: { maxHeight?: number }) {
  const { tasks, loading, error, refresh, counts, columns } = useTasks();
  const { bots } = useBots();
  const { sessions } = useSessions();
  const { apiClient, routerClient } = useConfig();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const effectiveMaxHeight = maxHeight ?? (stdout?.rows ?? 24);

  const [activeColumn, setActiveColumn] = useState<ColumnId>('pending');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subView, setSubView] = useState<SubView>('list');
  const [detailPanel, setDetailPanel] = useState<DetailPanel>('info');
  const [message, setMessage] = useState('');
  const [nudgeTarget, setNudgeTarget] = useState<Task | null>(null);

  const currentTasks = columns[activeColumn];

  // Viewport: how many task rows fit on screen
  const taskViewportSize = Math.max(effectiveMaxHeight - LIST_CHROME_LINES, 3);

  // Build sessionKey → sessionState lookup from Router sessions
  const sessionStateMap = useMemo(() => {
    const map = new Map<string, SessionState>();
    for (const s of sessions) {
      map.set(s.sessionKey, s.sessionState);
    }
    return map;
  }, [sessions]);

  // Clamp selectedIndex when column changes or tasks update
  useEffect(() => {
    if (selectedIndex >= currentTasks.length && currentTasks.length > 0) {
      setSelectedIndex(currentTasks.length - 1);
    }
  }, [currentTasks.length, selectedIndex]);

  // Clear message after 3s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  useInput((input, key) => {
    if (subView === 'delegate') return;

    // Nudge confirmation: y to send, Esc/q to cancel
    if (subView === 'nudge-confirm') {
      if (input === 'y' && nudgeTarget) {
        routerClient.nudgeTask(nudgeTarget.id)
          .then((res) => { setMessage(res.success ? 'Nudge sent' : `Nudge failed: ${res.reason}`); })
          .catch((e: Error) => setMessage(`Nudge failed: ${e.message}`));
        setSubView('list');
        setNudgeTarget(null);
      }
      if (key.escape || input === 'q') {
        setSubView('list');
        setNudgeTarget(null);
      }
      return;
    }

    if (subView === 'detail') {
      if (input === 'r') refresh();
      return;
    }

    // Tab cycles bottom detail panel
    if (key.tab && subView === 'list') {
      const idx = PANEL_ORDER.indexOf(detailPanel);
      setDetailPanel(PANEL_ORDER[(idx + 1) % PANEL_ORDER.length]);
    }

    if ((key.leftArrow || input === 'h') && subView === 'list') {
      const idx = COLUMN_ORDER.indexOf(activeColumn);
      if (idx > 0) {
        setActiveColumn(COLUMN_ORDER[idx - 1]);
        setSelectedIndex(0);
      }
    }
    if ((key.rightArrow || input === 'l') && subView === 'list') {
      const idx = COLUMN_ORDER.indexOf(activeColumn);
      if (idx < COLUMN_ORDER.length - 1) {
        setActiveColumn(COLUMN_ORDER[idx + 1]);
        setSelectedIndex(0);
      }
    }
    if ((key.upArrow || input === 'k') && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
    if ((key.downArrow || input === 'j') && selectedIndex < currentTasks.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
    if (key.return && currentTasks.length > 0) {
      setSubView('detail');
    }
    if (input === 'd') {
      setSubView('delegate');
    }
    if (input === 'r') {
      refresh();
      setMessage('Refreshed');
    }
    if (input === 'c' && currentTasks[selectedIndex]) {
      const task = currentTasks[selectedIndex];
      if (task.status === 'pending' || task.status === 'accepted' || task.status === 'processing') {
        apiClient.cancelTask(task.id)
          .then(() => { setMessage('Task cancelled'); refresh(); })
          .catch((e: Error) => setMessage(`Cancel failed: ${e.message}`));
      } else {
        setMessage('Can only cancel pending/accepted/processing tasks');
      }
    }
    if (input === 'R' && currentTasks[selectedIndex]) {
      const task = currentTasks[selectedIndex];
      if (task.status === 'failed' || task.status === 'cancelled' || task.status === 'timeout') {
        apiClient.retryTask(task)
          .then(() => { setMessage('Retry task created'); refresh(); })
          .catch((e: Error) => setMessage(`Retry failed: ${e.message}`));
      } else {
        setMessage('Can only retry failed/cancelled/timeout tasks');
      }
    }
    if (input === 'n' && currentTasks[selectedIndex]) {
      const task = currentTasks[selectedIndex];
      if (task.status === 'accepted' || task.status === 'processing') {
        setNudgeTarget(task);
        setSubView('nudge-confirm');
      } else {
        setMessage('Can only nudge accepted/processing tasks');
      }
    }
  });

  if (loading) return <Spinner label="Loading tasks..." />;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (subView === 'delegate') {
    return (
      <DelegateForm
        onSubmit={async (data) => {
          try {
            await apiClient.delegateTask(data);
            setMessage('Task delegated');
            setSubView('list');
            refresh();
          } catch (e) {
            setMessage(`Delegate failed: ${(e as Error).message}`);
          }
        }}
        onIntentSubmit={async (data) => {
          try {
            await routerClient.delegateIntent(data.fromBotId, data.intentText);
            setMessage('Intent submitted');
            setSubView('list');
            refresh();
          } catch (e) {
            setMessage(`Intent failed: ${(e as Error).message}`);
          }
        }}
        onCancel={() => setSubView('list')}
      />
    );
  }

  if (subView === 'detail' && currentTasks[selectedIndex]) {
    return (
      <TaskDetailView
        task={currentTasks[selectedIndex]}
        tasks={tasks}
        routerClient={routerClient}
        onBack={() => setSubView('list')}
      />
    );
  }

  if (subView === 'nudge-confirm' && nudgeTarget) {
    const previewLines = [
      '[ClawTeam Task — Manual Nudge]',
      `Task ID: ${nudgeTarget.id}`,
      `Capability: ${nudgeTarget.capability}`,
      `Status: ${nudgeTarget.status}`,
      '',
      'This is a manual nudge from the dashboard operator.',
      'Please continue working on the task and complete it when done.',
    ];

    return (
      <Box flexDirection="column">
        <Text bold> Nudge Confirmation </Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>The following message will be sent to the executor session:</Text>
        </Box>
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          {previewLines.map((line, i) => (
            <Text key={i} color="cyan">{line || ' '}</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Session: </Text>
          <Text>{nudgeTarget.executorSessionKey ?? 'unknown'}</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold color="yellow">Press </Text>
          <Text bold color="green">y</Text>
          <Text bold color="yellow"> to send, </Text>
          <Text bold color="green">Esc</Text>
          <Text bold color="yellow"> to cancel</Text>
        </Box>
      </Box>
    );
  }

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const selectedTask = currentTasks[selectedIndex] ?? null;
  const selectedSessionState = selectedTask?.executorSessionKey
    ? sessionStateMap.get(selectedTask.executorSessionKey) ?? null
    : null;

  const headerSep = '─'.repeat(Math.max(termWidth - 2, 40));

  return (
    <Box flexDirection="column" width="100%">
      {/* Title bar */}
      <Box>
        <Text bold> Dashboard </Text>
        <Text dimColor> {time}</Text>
      </Box>

      {/* Stats row */}
      <Box>
        <Text dimColor> Bots: </Text>
        <Text>{bots.length}</Text>
        <Text dimColor> ({bots.filter(b => b.status === 'online').length} online)  </Text>
        <Text dimColor>Tasks: </Text>
        <Text>{tasks.length}</Text>
        <Text dimColor>  </Text>
        <Text color="yellow">◔ {counts.pending}</Text>
        <Text dimColor>  </Text>
        <Text color="blue">● {counts.processing}</Text>
        <Text dimColor>  </Text>
        <Text color="yellow">⏳ {counts.waiting}</Text>
        <Text dimColor>  </Text>
        <Text color="green">✔ {counts.completed}</Text>
        <Text dimColor>  </Text>
        <Text color="red">✘ {counts.failed}</Text>
      </Box>

      {/* Column tabs */}
      <Box marginTop={1}>
        <ColumnTabs activeColumn={activeColumn} counts={counts} />
      </Box>

      {/* Separator + column heading */}
      <Box marginTop={1}>
        <Text dimColor>{'─── ' + COLUMN_LABELS[activeColumn] + ' (' + currentTasks.length + ') ' + headerSep.slice(0, Math.max(termWidth - 25, 20))}</Text>
      </Box>

      {/* Table header — matches TaskRow flex layout */}
      <Box width="100%">
        <Box width={2}><Text> </Text></Box>
        <Box width={12}><Text bold dimColor>Status</Text></Box>
        <Box flexGrow={2} flexShrink={1} flexBasis={12}><Text bold dimColor>Name</Text></Box>
        <Box width={1}><Text> </Text></Box>
        <Box flexGrow={1} flexShrink={1} flexBasis={10}><Text bold dimColor>From → To</Text></Box>
        <Box width={1}><Text> </Text></Box>
        <Box width={5}><Text bold dimColor>Pri</Text></Box>
        <Box width={1}><Text> </Text></Box>
        <Box width={4}><Text bold dimColor>Age</Text></Box>
        <Box width={1}><Text> </Text></Box>
        <Box flexGrow={1} flexShrink={1} flexBasis={6}><Text bold dimColor>Session</Text></Box>
      </Box>

      {/* Task rows (viewport-scrolled) */}
      <Box flexDirection="column" width="100%" height={taskViewportSize}>
        {(() => {
          if (currentTasks.length === 0) {
            return <Text dimColor>  No tasks in this column</Text>;
          }

          const needsScroll = currentTasks.length > taskViewportSize;
          // Reserve 2 lines for scroll indicators when scrolling is active
          const rowCapacity = needsScroll ? taskViewportSize - 2 : taskViewportSize;

          let scrollTop = 0;
          if (needsScroll) {
            scrollTop = Math.min(
              Math.max(0, selectedIndex - Math.floor(rowCapacity / 2)),
              currentTasks.length - rowCapacity,
            );
          }
          const visibleTasks = currentTasks.slice(scrollTop, scrollTop + rowCapacity);
          const aboveCount = scrollTop;
          const belowCount = currentTasks.length - scrollTop - visibleTasks.length;

          return (
            <>
              {needsScroll && (
                <Text dimColor>{aboveCount > 0 ? `  ↑ ${aboveCount} more` : ' '}</Text>
              )}
              {visibleTasks.map((task, vi) => {
                const realIndex = scrollTop + vi;
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={realIndex === selectedIndex}
                    sessionState={task.executorSessionKey
                      ? sessionStateMap.get(task.executorSessionKey) ?? null
                      : null}
                  />
                );
              })}
              {needsScroll && (
                <Text dimColor>{belowCount > 0 ? `  ↓ ${belowCount} more` : ' '}</Text>
              )}
            </>
          );
        })()}
      </Box>

      {/* Tabbed bottom panel for selected task */}
      {selectedTask && (
        <Box marginTop={1} flexDirection="column" width="100%">
          <Text dimColor>{'─'.repeat(Math.max(termWidth - 2, 40))}</Text>
          <DetailTabs
            activePanel={detailPanel}
            hasSession={!!selectedTask.executorSessionKey}
            hasTree={!!selectedTask.parentTaskId || tasks.some(t => t.parentTaskId === selectedTask.id)}
          />
          <Box marginTop={1} flexDirection="column" width="100%">
            {detailPanel === 'info' && (
              <InfoPanel
                task={selectedTask}
                sessionState={selectedSessionState}
                termWidth={termWidth}
              />
            )}
            {detailPanel === 'session' && selectedTask.executorSessionKey && (
              <TaskSessionPanel
                sessionKey={selectedTask.executorSessionKey}
                routerClient={routerClient}
              />
            )}
            {detailPanel === 'session' && !selectedTask.executorSessionKey && (
              <Text dimColor>No executor session</Text>
            )}
            {detailPanel === 'timeline' && (
              <TaskTimeline task={selectedTask} />
            )}
            {detailPanel === 'tree' && (
              <TaskTree tasks={getTaskFamily(tasks, selectedTask.id)} focusTaskId={selectedTask.id} />
            )}
            {detailPanel === 'avatar' && (() => {
              const bot = selectedTask.toBotId
                ? bots.find(b => b.id === selectedTask.toBotId)
                : undefined;
              return (
                <Box>
                  <BotAvatar
                    botStatus={bot?.status}
                    taskStatus={selectedTask.status}
                  />
                  <Box flexDirection="column" flexGrow={1} marginLeft={1}>
                    <Box>
                      <Text dimColor>Bot: </Text>
                      <Text bold>{bot?.name ?? (selectedTask.toBotId || 'unassigned')}</Text>
                    </Box>
                    <Box>
                      <Text dimColor>Status: </Text>
                      {bot ? <StatusBadge status={bot.status} /> : <Text dimColor>-</Text>}
                    </Box>
                    <Box>
                      <Text dimColor>Capabilities: </Text>
                      <Text>{bot?.capabilities.join(', ') ?? '-'}</Text>
                    </Box>
                    <Box>
                      <Text dimColor>Task: </Text>
                      <Text>{selectedTask.capability}</Text>
                      <Text dimColor> ({selectedTask.status})</Text>
                    </Box>
                  </Box>
                </Box>
              );
            })()}
          </Box>
        </Box>
      )}

      {/* Message bar */}
      {message && <Box marginTop={1}><Text color="yellow">{message}</Text></Box>}

      {/* Key hints */}
      <KeyHint hints={[
        { key: '←→', label: 'column' },
        { key: '↑↓', label: 'task' },
        { key: 'Tab', label: 'panel' },
        { key: 'Enter', label: 'detail' },
        { key: 'd', label: 'delegate' },
        { key: 'n', label: 'nudge' },
        { key: 'R', label: 'retry' },
        { key: 'c', label: 'cancel' },
        { key: 'r', label: 'refresh' },
      ]} />
    </Box>
  );
}
