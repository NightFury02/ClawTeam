/**
 * BotAvatar — Cyberpunk cat ASCII art with per-status frame animation
 *
 * 4-line-high cat avatar that changes expression, color and animation
 * based on bot/task status. Each status has 2-3 frames cycling at 300ms.
 */

import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import type { Task } from '../api/types.js';

type AvatarStatus = 'online' | 'processing' | 'waiting_for_input' | 'completed' | 'failed' | 'offline' | 'pending';

const AVATAR_FRAMES: Record<AvatarStatus, string[][]> = {
  online: [
    [
      '  /\\_/\\  ',
      ' ( ◕ω◕ ) ',
      ' />♡ <\\  ',
      ' ▓▒░░▒▓  ',
    ],
    [
      '  /\\_/\\  ',
      ' ( ─ω─ ) ',
      ' />♡ <\\  ',
      ' ▓▒░░▒▓  ',
    ],
  ],
  processing: [
    [
      '  /\\_/\\   ',
      ' ( ◉.◉ ) ⚙',
      ' />⚙ <\\   ',
      ' ▓▒░░▒▓   ',
    ],
    [
      '  /\\_/\\   ',
      ' ( ◉·◉ ) ✦',
      ' />✧ <\\   ',
      ' ▒▓▓▒░▒   ',
    ],
    [
      '  /\\_/\\   ',
      ' ( ◉.◉ ) ⚡',
      ' />⚙ <\\   ',
      ' ░▒▓▓▒░   ',
    ],
  ],
  waiting_for_input: [
    [
      '  /\\_/\\  ',
      ' ( ◔?◔ ) ',
      ' />~ <\\  ',
      ' ▓▒░░▒▓  ',
    ],
    [
      '  /\\_/\\  ',
      ' ( ◔.◔ ) ',
      ' />? <\\  ',
      ' ▓▒░░▒▓  ',
    ],
  ],
  completed: [
    [
      '  /\\_/\\   ',
      ' ( ^ω^ ) ✓',
      ' />✓ <\\   ',
      ' ▓▒░░▒▓   ',
    ],
    [
      '  /\\_/\\   ',
      ' ( ^ω^ )✓ ',
      ' />✓ <\\   ',
      ' ▓▒██▒▓   ',
    ],
  ],
  failed: [
    [
      '  /\\_/\\   ',
      ' ( ×_× ) !',
      ' />! <\\   ',
      ' ▓▒░░▒▓   ',
    ],
    [
      '  /\\_/\\   ',
      ' ( ×_× )  ',
      ' />! <\\   ',
      ' ▒░░░░▒   ',
    ],
  ],
  offline: [
    [
      '  /\\_/\\    ',
      ' ( -.- )  z',
      ' />  <\\  z ',
      ' ░░░░░░    ',
    ],
    [
      '  /\\_/\\    ',
      ' ( -.- ) z ',
      ' />  <\\   z',
      ' ░░░░░░    ',
    ],
  ],
  pending: [
    [
      '  /\\_/\\  ',
      ' ( ◕.◕ ) ',
      ' />◔ <\\  ',
      ' ▓▒░░▒▓  ',
    ],
    [
      '  /\\_/\\  ',
      ' ( ◕.◕ ) ',
      ' />◑ <\\  ',
      ' ▓▒░░▒▓  ',
    ],
  ],
};

const STATUS_COLORS: Record<AvatarStatus, string> = {
  online: 'cyan',
  processing: 'blue',
  waiting_for_input: 'yellow',
  completed: 'green',
  failed: 'red',
  offline: 'gray',
  pending: 'yellow',
};

/** Derive the avatar status from bot status and task status */
export function resolveAvatarStatus(
  botStatus?: 'online' | 'offline' | 'busy',
  taskStatus?: Task['status'],
): AvatarStatus {
  // Offline bot always takes priority
  if (botStatus === 'offline') return 'offline';

  // Map task status to avatar status
  if (taskStatus) {
    switch (taskStatus) {
      case 'processing':
      case 'accepted':
        return 'processing';
      case 'waiting_for_input':
        return 'waiting_for_input';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
      case 'timeout':
        return 'failed';
      case 'pending':
        return 'pending';
    }
  }

  // Default: use bot status
  if (botStatus === 'busy') return 'processing';
  return 'online';
}

interface Props {
  botStatus?: 'online' | 'offline' | 'busy';
  taskStatus?: Task['status'];
}

export function BotAvatar({ botStatus, taskStatus }: Props) {
  const avatarStatus = resolveAvatarStatus(botStatus, taskStatus);
  const frames = AVATAR_FRAMES[avatarStatus];
  const color = STATUS_COLORS[avatarStatus];

  const [frameIndex, setFrameIndex] = useState(0);

  // Reset frame when status changes
  useEffect(() => {
    setFrameIndex(0);
  }, [avatarStatus]);

  // Frame animation timer
  useEffect(() => {
    if (frames.length <= 1) return;

    // Blink-style: first frame stays longer for 'online'
    const interval = avatarStatus === 'online' ? 2000 : 300;
    let tick = 0;

    const timer = setInterval(() => {
      tick++;
      if (avatarStatus === 'online') {
        // Blink pattern: show frame 1 briefly, then back to frame 0
        setFrameIndex((prev) => (prev === 0 ? 1 : 0));
      } else {
        setFrameIndex(tick % frames.length);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [avatarStatus, frames.length]);

  const currentFrame = frames[frameIndex % frames.length];

  return (
    <Box flexDirection="column" width={16}>
      {currentFrame.map((line, i) => (
        <Text key={i} color={color}>{line}</Text>
      ))}
    </Box>
  );
}
