/**
 * ClawTeam Auto Tracker Plugin
 *
 * Hooks into sessions_spawn to automatically:
 * - Detect ClawTeam spawns via _clawteam_role param (set by LLM)
 * - Create tasks for sender role when no _clawteam_taskId is provided
 * - Inject task_system_prompt.md into the task param (prepended), replacing placeholders
 * - Track sessions via /gateway/track-session after spawn completes
 *
 * Supported params on sessions_spawn:
 *   _clawteam_role        "executor" | "sender"
 *   _clawteam_taskId      UUID (required for executor, auto-created for sender)
 *   _clawteam_from_bot_id fromBotId for {{FROM_BOT_ID}} placeholder
 *
 * Placeholders in task_system_prompt.md:
 *   {{TASK_ID}}      → real taskId
 *   {{ROLE}}         → executor | sender
 *   {{GATEWAY_URL}}  → gateway base URL (from pluginConfig.gatewayUrl)
 *   {{FROM_BOT_ID}}  → delegator bot ID
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK_ID_KEY = '_clawteam_taskId';
const ROLE_KEY = '_clawteam_role';
const FROM_BOT_ID_KEY = '_clawteam_from_bot_id';
const TAG = '[clawteam-auto-tracker]';

/** Shared headers for gateway JSON API calls */
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

/** Load task_system_prompt.md from the plugin directory */
function loadSystemPromptTemplate(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const templatePath = path.join(dir, 'task_system_prompt.md');
    return fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    console.warn(`${TAG} failed to load task_system_prompt.md:`, (err as Error).message);
    return '';
  }
}

/** Replace all known placeholders in the template */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replaceAll('{{TASK_ID}}', vars.taskId ?? '')
    .replaceAll('{{ROLE}}', vars.role ?? '')
    .replaceAll('{{GATEWAY_URL}}', vars.gatewayUrl ?? '')
    .replaceAll('{{FROM_BOT_ID}}', vars.fromBotId ?? '');
}

export default {
  id: 'clawteam-auto-tracker',
  name: 'ClawTeam Auto Tracker',

  register(api: any) {
    const config = api.pluginConfig ?? {};
    if (config.enabled === false) return;
    const gw = config.gatewayUrl || 'http://localhost:3100';

    const systemPromptTemplate = loadSystemPromptTemplate();
    console.log(`${TAG} registered (gateway: ${gw}, template: ${systemPromptTemplate ? 'loaded' : 'missing'})`);

    // Cross-hook state: last taskId set by before_tool_call, consumed by tool_result_persist
    let pendingTaskId: string | null = null;
    // =========================================================================
    // before_tool_call: create task if needed, inject system prompt into task
    // =========================================================================
    api.on('before_tool_call', async (event: any, _ctx: any) => {
      if (event.toolName !== 'sessions_spawn') return;

      const role = event.params?.[ROLE_KEY];
      if (!role) return; // Not a ClawTeam spawn, skip

      let taskId = event.params?.[TASK_ID_KEY];
      const fromBotId = String(event.params?.[FROM_BOT_ID_KEY] ?? '');
      console.log(`${TAG} before_tool_call: role=${role}, taskId=${taskId || '(none)'}, fromBotId=${fromBotId || '(none)'}`);

      // Sender without taskId: auto-create task via gateway (block spawn on failure)
      if (!taskId && role === 'sender') {
        const task = String(event.params?.task ?? '');
        const label = String(event.params?.label ?? '');
        console.log(`${TAG} creating task via ${gw}/gateway/tasks/create`);
        try {
          const res = await fetch(`${gw}/gateway/tasks/create`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ prompt: task, title: label || task.slice(0, 100) }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`${TAG} create task failed, HTTP ${res.status}: ${errText}`);
            return { block: true, blockReason: `Failed to create task (HTTP ${res.status}). Fix the issue before spawning.` };
          }
          const data = await res.json();
          taskId = data.taskId || data.data?.taskId;
          if (!taskId) {
            console.error(`${TAG} create task response missing taskId:`, JSON.stringify(data));
            return { block: true, blockReason: 'Failed to create task: response missing taskId.' };
          }
          console.log(`${TAG} task created, taskId=${taskId}`);
        } catch (err) {
          console.error(`${TAG} create task error:`, (err as Error).message);
          return { block: true, blockReason: `Failed to create task: ${(err as Error).message}` };
        }
      }

      // Executor without taskId: block spawn
      if (!taskId && role === 'executor') {
        console.error(`${TAG} executor role requires _clawteam_taskId`);
        return { block: true, blockReason: 'Executor spawn requires _clawteam_taskId param.' };
      }

      // Non-sender roles require _clawteam_from_bot_id
      if (role !== 'sender' && !fromBotId) {
        console.error(`${TAG} role="${role}" requires _clawteam_from_bot_id`);
        return { block: true, blockReason: `Role "${role}" requires _clawteam_from_bot_id param.` };
      }

      // Inject system prompt into task content
      const originalTask = String(event.params?.task ?? '');
      const injectedParams: Record<string, any> = { [TASK_ID_KEY]: taskId };

      if (systemPromptTemplate) {
        const rendered = renderTemplate(systemPromptTemplate, {
          taskId: taskId!,
          role,
          gatewayUrl: gw,
          fromBotId,
        });
        injectedParams.task = rendered + originalTask;
        console.log(`${TAG} injected system prompt into task (taskId=${taskId})`);
      }

      pendingTaskId = taskId!;
      return { params: injectedParams };
    });

    // =========================================================================
    // after_tool_call: track session after spawn completes
    // =========================================================================
    api.on('after_tool_call', async (event: any, _ctx: any) => {
      if (event.toolName !== 'sessions_spawn') return;

      const taskId = event.params?.[TASK_ID_KEY];
      const role = event.params?.[ROLE_KEY];
      if (!taskId || !role) return;

      console.log(`${TAG} after_tool_call: taskId=${taskId}, role=${role}`);

      if (event.error) {
        console.warn(`${TAG} spawn error, skipping track-session:`, event.error);
        return;
      }

      const details = (event.result as any)?.details;
      console.log(`${TAG} after_tool_call: result.details=`, JSON.stringify(details));

      if (details?.status !== 'accepted') {
        console.warn(`${TAG} spawn status="${details?.status}", skipping track-session`);
        return;
      }

      const childSessionKey = details?.childSessionKey;
      if (!childSessionKey) {
        console.warn(`${TAG} no childSessionKey in spawn result, skipping track-session`);
        return;
      }

      console.log(`${TAG} calling ${gw}/gateway/track-session`);
      try {
        const res = await fetch(`${gw}/gateway/track-session`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ taskId, sessionKey: childSessionKey, role }),
        });
        console.log(`${TAG} track-session response: HTTP ${res.status}`);
      } catch (err) {
        console.warn(`${TAG} track-session error:`, (err as Error).message);
      }
    });

    // =========================================================================
    // tool_result_persist: append taskId to the sessions_spawn result shown to main session
    // =========================================================================
    api.on('tool_result_persist', (event: any, _ctx: any) => {
      if (event.toolName !== 'sessions_spawn') return;
      const taskId = pendingTaskId;
      pendingTaskId = null; // consume
      if (!taskId) return;

      const msg = event.message;
      if (!msg) return;

      // Append taskId to the text content of the tool result message
      const appendText = `\n[ClawTeam] taskId: ${taskId}`;
      if (Array.isArray(msg.content)) {
        const textBlock = msg.content.find((b: any) => b.type === 'tool_result' || b.type === 'text');
        if (textBlock) {
          if (typeof textBlock.content === 'string') {
            textBlock.content += appendText;
          } else if (Array.isArray(textBlock.content)) {
            const inner = textBlock.content.find((b: any) => b.type === 'text');
            if (inner) inner.text = (inner.text ?? '') + appendText;
          }
        }
      } else if (typeof msg.content === 'string') {
        msg.content += appendText;
      }

      console.log(`${TAG} appended taskId=${taskId} to sessions_spawn result`);
      return { message: msg };
    });
  },
};
