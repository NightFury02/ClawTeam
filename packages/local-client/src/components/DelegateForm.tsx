/**
 * DelegateForm — Form for creating/delegating a new task
 *
 * Supports two modes:
 * - Precise: specify capability, fromBotId, toBotId, priority
 * - Intent: specify fromBotId and free-text intent description
 *
 * Ctrl+T toggles between modes.
 */

import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';

type DelegateMode = 'precise' | 'intent';

interface Props {
  toBotId?: string;
  onSubmit: (data: { capability: string; fromBotId: string; toBotId: string; priority: string }) => void;
  onIntentSubmit?: (data: { fromBotId: string; intentText: string }) => void;
  onCancel: () => void;
}

type PreciseField = 'capability' | 'fromBotId' | 'toBotId' | 'priority';
const PRECISE_FIELDS: PreciseField[] = ['capability', 'fromBotId', 'toBotId', 'priority'];
const PRECISE_LABELS: Record<PreciseField, string> = {
  capability: 'Capability',
  fromBotId: 'From Bot',
  toBotId: 'To Bot',
  priority: 'Priority',
};

type IntentField = 'fromBotId' | 'intentText';
const INTENT_FIELDS: IntentField[] = ['fromBotId', 'intentText'];
const INTENT_LABELS: Record<IntentField, string> = {
  fromBotId: 'From Bot',
  intentText: 'Intent',
};

export function DelegateForm({ toBotId, onSubmit, onIntentSubmit, onCancel }: Props) {
  const [mode, setMode] = useState<DelegateMode>('precise');
  const [preciseValues, setPreciseValues] = useState({
    capability: '',
    fromBotId: '',
    toBotId: toBotId ?? '',
    priority: 'normal',
  });
  const [intentValues, setIntentValues] = useState({
    fromBotId: '',
    intentText: '',
  });
  const [activeField, setActiveField] = useState(0);

  const fields = mode === 'precise' ? PRECISE_FIELDS : INTENT_FIELDS;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    // Ctrl+T: toggle mode
    if (key.ctrl && input === 't') {
      setMode(mode === 'precise' ? 'intent' : 'precise');
      setActiveField(0);
      return;
    }

    if (key.return) {
      if (activeField < fields.length - 1) {
        setActiveField(activeField + 1);
      } else if (mode === 'precise') {
        onSubmit(preciseValues);
      } else if (onIntentSubmit) {
        onIntentSubmit(intentValues);
      }
      return;
    }

    if (key.tab) {
      setActiveField((activeField + 1) % fields.length);
    }
  });

  if (mode === 'precise') {
    return (
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Text bold color="cyan">Delegate Task [Precise]</Text>
        <Text dimColor>Tab: next field  Enter: confirm  Esc: cancel  Ctrl+T: switch mode</Text>
        <Box marginTop={1} flexDirection="column">
          {PRECISE_FIELDS.map((field, i) => (
            <Box key={field}>
              <Box width={14}>
                <Text color={i === activeField ? 'cyan' : undefined}>
                  {PRECISE_LABELS[field]}:
                </Text>
              </Box>
              {i === activeField ? (
                <TextInput
                  value={preciseValues[field]}
                  onChange={(val) => setPreciseValues({ ...preciseValues, [field]: val })}
                />
              ) : (
                <Text>{preciseValues[field] || '-'}</Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold color="cyan">Delegate Task [Intent]</Text>
      <Text dimColor>Tab: next field  Enter: confirm  Esc: cancel  Ctrl+T: switch mode</Text>
      <Box marginTop={1} flexDirection="column">
        {INTENT_FIELDS.map((field, i) => (
          <Box key={field}>
            <Box width={14}>
              <Text color={i === activeField ? 'cyan' : undefined}>
                {INTENT_LABELS[field]}:
              </Text>
            </Box>
            {i === activeField ? (
              <TextInput
                value={intentValues[field]}
                onChange={(val) => setIntentValues({ ...intentValues, [field]: val })}
              />
            ) : (
              <Text>{intentValues[field] || '-'}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
