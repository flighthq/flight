import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { disableTextMarkupGuards, enableTextMarkupGuards } from './enableTextMarkupGuards.ts';
import { parseTextMarkup } from './textMarkup.ts';

let entries: LogEntry[];
let logState: LogState;

beforeEach(() => {
  entries = [];
  logState = createLogState();
  setLogSink(logState, (entry) => entries.push(entry));
});

afterEach(() => {
  disableTextMarkupGuards();
  setLogSink(logState, null);
});

function messages(): string {
  return entries.map((entry) => String((entry.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTextMarkupGuards', () => {
  it('restores silent parser recovery', () => {
    enableTextMarkupGuards(logState, () => 0);
    disableTextMarkupGuards();
    parseTextMarkup('<unknown>x</unknown>');
    expect(entries).toEqual([]);
  });
});

describe('enableTextMarkupGuards', () => {
  it('names the fixing APIs for each lossy parse decision', () => {
    enableTextMarkupGuards(logState, () => 0);
    parseTextMarkup('<unknown>x</unknown><font color="red">y</font><a href="javascript:run()">z</a>');
    expect(messages()).toContain('registerMarkupTag');
    expect(messages()).toContain('registerMarkupNamedColors');
    expect(messages()).toContain('unsafe URL scheme');
  });

  it('warns once per repeated subject', () => {
    enableTextMarkupGuards(logState, () => 0);
    parseTextMarkup('<unknown>x</unknown><unknown>y</unknown>');
    expect(entries).toHaveLength(1);
  });

  it('stays silent for supported markup with safe attributes', () => {
    enableTextMarkupGuards(logState, () => 0);
    parseTextMarkup('<font color="#fff">x</font><a href="/relative">y</a>');
    expect(entries).toEqual([]);
  });
});
