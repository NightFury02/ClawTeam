/**
 * KeyHint — Bottom bar showing available keyboard shortcuts
 */

import React from 'react';
import { Text, Box } from 'ink';

interface Hint {
  key: string;
  label: string;
}

interface Props {
  hints: Hint[];
}

export function KeyHint({ hints }: Props) {
  return (
    <Box marginTop={1}>
      {hints.map((h, i) => (
        <Box key={h.key} marginRight={2}>
          <Text bold color="cyan">{h.key}</Text>
          <Text dimColor>: {h.label}</Text>
          {i < hints.length - 1 && <Text dimColor>  </Text>}
        </Box>
      ))}
    </Box>
  );
}
