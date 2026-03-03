/**
 * Table — Generic terminal table component
 */

import React from 'react';
import { Text, Box } from 'ink';

interface Column<T> {
  key: string;
  label: string;
  width: number;
  render?: (row: T, index: number) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  selectedIndex?: number;
}

export function Table<T extends Record<string, unknown>>({ columns, data, selectedIndex }: Props<T>) {
  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width}>
            <Text bold dimColor>{col.label.padEnd(col.width)}</Text>
          </Box>
        ))}
      </Box>
      {data.map((row, i) => (
        <Box key={i}>
          {selectedIndex === i && <Text color="cyan">{' > '}</Text>}
          {selectedIndex !== undefined && selectedIndex !== i && <Text>{'   '}</Text>}
          {columns.map((col) => (
            <Box key={col.key} width={col.width}>
              {col.render
                ? col.render(row, i)
                : <Text>{String(row[col.key] ?? '').slice(0, col.width - 1)}</Text>
              }
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
