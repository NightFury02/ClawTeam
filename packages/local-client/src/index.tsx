#!/usr/bin/env node
/**
 * ClawTeam Local Client — Entry Point
 *
 * Loads configuration and renders the Ink TUI application.
 * Uses the terminal alternate screen buffer for a stable, fullscreen experience.
 */

import React from 'react';
import { render } from 'ink';
import { loadClientConfig } from './config.js';
import { ConfigProvider } from './hooks/useConfig.js';
import { App } from './views/App.js';

// Alternate screen buffer ANSI sequences (same as vim/htop)
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

function enterFullscreen(): void {
  process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
}

function leaveFullscreen(): void {
  process.stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
}

function main() {
  const config = loadClientConfig();

  if (!config.api.key) {
    console.error('No API key configured.');
    console.error('Create ~/.clawteam/config.yaml with:');
    console.error('');
    console.error('api:');
    console.error('  url: http://localhost:3000');
    console.error('  key: your-api-key-here');
    console.error('');
    console.error('router:');
    console.error('  url: http://localhost:3100');
    process.exit(1);
  }

  enterFullscreen();

  // Ensure we leave alternate screen on any exit
  const cleanup = () => leaveFullscreen();
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  render(
    <ConfigProvider config={config}>
      <App />
    </ConfigProvider>,
  );
}

main();
