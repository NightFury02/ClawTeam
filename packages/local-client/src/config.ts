/**
 * Local Client Configuration
 *
 * Reads ~/.clawteam/config.yaml for API endpoints and preferences.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from 'yaml';

export interface ClientConfig {
  api: {
    url: string;
    key: string;
  };
  router: {
    url: string;
  };
  preferences: {
    refreshInterval: number;
    messageCount: number;
    openclawHome: string;
  };
}

const DEFAULT_CONFIG: ClientConfig = {
  api: { url: 'http://localhost:3000', key: '' },
  router: { url: 'http://localhost:3100' },
  preferences: {
    refreshInterval: 5,
    messageCount: 20,
    openclawHome: path.join(os.homedir(), '.openclaw'),
  },
};

export function loadClientConfig(): ClientConfig {
  const configPath = path.join(os.homedir(), '.clawteam', 'config.yaml');

  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = parse(raw) ?? {};
    return {
      api: {
        url: parsed.api?.url ?? DEFAULT_CONFIG.api.url,
        key: parsed.api?.key ?? DEFAULT_CONFIG.api.key,
      },
      router: {
        url: parsed.router?.url ?? DEFAULT_CONFIG.router.url,
      },
      preferences: {
        refreshInterval: parsed.preferences?.refreshInterval ?? DEFAULT_CONFIG.preferences.refreshInterval,
        messageCount: parsed.preferences?.messageCount ?? DEFAULT_CONFIG.preferences.messageCount,
        openclawHome: parsed.preferences?.openclawHome?.replace('~', os.homedir()) ?? DEFAULT_CONFIG.preferences.openclawHome,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
