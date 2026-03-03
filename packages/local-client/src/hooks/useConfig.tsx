/**
 * useConfig — Configuration context hook
 */

import React, { createContext, useContext } from 'react';
import type { ClientConfig } from '../config.js';
import { ClawTeamClient } from '../api/clawteam-client.js';
import { RouterClient } from '../api/router-client.js';

interface ConfigContextValue {
  config: ClientConfig;
  apiClient: ClawTeamClient;
  routerClient: RouterClient;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({
  config,
  children,
}: {
  config: ClientConfig;
  children: React.ReactNode;
}) {
  const apiClient = React.useMemo(
    () => new ClawTeamClient(config.api.url, config.api.key),
    [config.api.url, config.api.key],
  );
  const routerClient = React.useMemo(
    () => new RouterClient(config.router.url),
    [config.router.url],
  );

  return (
    <ConfigContext.Provider value={{ config, apiClient, routerClient }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
