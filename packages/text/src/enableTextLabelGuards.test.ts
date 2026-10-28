import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import { setTextLayoutMeasureProvider } from '@flighthq/textlayout/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { disableTextLabelGuards, enableTextLabelGuards } from './enableTextLabelGuards.ts';
import { createTextLabel, setTextLabelString } from './textLabel.ts';
import { ensureTextLayout } from './textLabelLayout.ts';

const measure = (text: string) => text.length * 7;

let entries: LogEntry[];
let logState: LogState;

beforeEach(() => {
  entries = [];
  logState = createLogState();
  setLogSink(logState, (entry) => entries.push(entry));
  setTextLayoutMeasureProvider(measure);
});

afterEach(() => {
  disableTextLabelGuards();
  setLogSink(logState, null);
  setTextLayoutMeasureProvider(null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTextLabelGuards', () => {
  it('stops the warning a previously-installed guard would emit', () => {
    enableTextLabelGuards(logState, () => 0);
    disableTextLabelGuards();

    const label = createTextLabel();
    setTextLabelString(label, 'before');
    ensureTextLayout(label);
    label.data.text = 'after';
    ensureTextLayout(label);

    expect(entries).toEqual([]);
  });
});

describe('enableTextLabelGuards', () => {
  it('warns with both the live and rasterized strings when data.text is mutated directly', () => {
    enableTextLabelGuards(logState, () => 0);

    const label = createTextLabel();
    setTextLabelString(label, 'original text');
    ensureTextLayout(label);

    label.data.text = 'changed text';
    ensureTextLayout(label);

    expect(messages()).toContain('changed text');
    expect(messages()).toContain('original text');
    expect(messages()).toContain('setTextLabelString');
  });

  it('stays silent when text is changed via setTextLabelString', () => {
    enableTextLabelGuards(logState, () => 0);

    const label = createTextLabel();
    setTextLabelString(label, 'first');
    ensureTextLayout(label);
    setTextLabelString(label, 'second');
    ensureTextLayout(label);

    expect(entries).toEqual([]);
  });

  it('stays silent when no guard is installed', () => {
    const label = createTextLabel();
    setTextLabelString(label, 'before');
    ensureTextLayout(label);
    label.data.text = 'after';
    ensureTextLayout(label);

    expect(entries).toEqual([]);
  });
});
