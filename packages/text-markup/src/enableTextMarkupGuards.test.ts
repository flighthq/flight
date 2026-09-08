import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { disableTextMarkupGuards, enableTextMarkupGuards } from './enableTextMarkupGuards';
import { parseTextMarkup } from './textMarkup';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableTextMarkupGuards();
  setLogSink(null);
});

function messages(): string {
  return entries.map((entry) => String((entry.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTextMarkupGuards', () => {
  it('restores silent parser recovery', () => {
    enableTextMarkupGuards();
    disableTextMarkupGuards();
    parseTextMarkup('<unknown>x</unknown>');
    expect(entries).toEqual([]);
  });
});

describe('enableTextMarkupGuards', () => {
  it('names the fixing APIs for each lossy parse decision', () => {
    enableTextMarkupGuards();
    parseTextMarkup('<unknown>x</unknown><font color="red">y</font><a href="javascript:run()">z</a>');
    expect(messages()).toContain('registerMarkupTag');
    expect(messages()).toContain('registerMarkupNamedColors');
    expect(messages()).toContain('unsafe URL scheme');
  });

  it('warns once per repeated subject', () => {
    enableTextMarkupGuards();
    parseTextMarkup('<unknown>x</unknown><unknown>y</unknown>');
    expect(entries).toHaveLength(1);
  });

  it('stays silent for supported markup with safe attributes', () => {
    enableTextMarkupGuards();
    parseTextMarkup('<font color="#fff">x</font><a href="/relative">y</a>');
    expect(entries).toEqual([]);
  });
});
