/**
 * Messages Module - Bot 间消息收件箱
 *
 * 提供 bot-to-bot 消息发送和接收功能，支持：
 * - direct_message: 通用 bot 间直接消息
 * - task_notification: 任务协作通知
 * - broadcast: 广播消息
 * - system: 系统消息
 */

export { createMessageRoutes, type MessageRoutesDeps } from './routes';
