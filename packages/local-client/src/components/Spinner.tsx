/**
 * Spinner — Loading indicator
 */

import React from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface Props {
  label?: string;
}

export function Spinner({ label = 'Loading...' }: Props) {
  return (
    <Text>
      <InkSpinner type="dots" /> {label}
    </Text>
  );
}
