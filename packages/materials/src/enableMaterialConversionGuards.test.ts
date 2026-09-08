import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createPhongMaterial } from './classicMaterials';
import { disableMaterialConversionGuards, enableMaterialConversionGuards } from './enableMaterialConversionGuards';
import {
  convertSpecularGlossinessToStandardPbr,
  createSpecularGlossinessPbrMaterial,
  createStandardPbrMaterial,
} from './pbrMaterials';
import { convertPhongToStandardPbrMaterial } from './phongToPbr';

// logOnce dedupes by key for the life of the PROCESS, so without clearing, the first test to warn under
// a given key silences every later one — a test would then pass or fail on its position in the file.
afterEach(() => {
  disableMaterialConversionGuards();
  clearLogOnceKeys();
});

const texture = {} as never;

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

describe('disableMaterialConversionGuards', () => {
  it('restores the silent conversion', () => {
    const entries = captureLog(() => {
      enableMaterialConversionGuards();
      disableMaterialConversionGuards();
      convertPhongToStandardPbrMaterial(createPhongMaterial({ specularMap: texture }));
    });
    expect(entries).toEqual([]);
  });
});

describe('enableMaterialConversionGuards', () => {
  it('WARNS when the spec-gloss conversion drops its packed map, telling the caller to bake', () => {
    const entries = captureLog(() => {
      enableMaterialConversionGuards();
      convertSpecularGlossinessToStandardPbr(
        createStandardPbrMaterial(),
        createSpecularGlossinessPbrMaterial({ specularGlossinessMap: texture }),
      );
    });
    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('convertSpecularGlossinessToStandardPbr');
    // The remedy has to be in the message, or the reader learns only that something vanished.
    expect(messageOf(entries[0])).toContain('Bake');
  });

  it('WARNS SEPARATELY for the Phong conversion, so one does not silence the other', () => {
    const entries = captureLog(() => {
      enableMaterialConversionGuards();
      convertSpecularGlossinessToStandardPbr(
        createStandardPbrMaterial(),
        createSpecularGlossinessPbrMaterial({ specularGlossinessMap: texture }),
      );
      convertPhongToStandardPbrMaterial(createPhongMaterial({ specularMap: texture }));
    });
    // logOnce is keyed per conversion: two converters dropping maps in one process must both be heard.
    expect(entries).toHaveLength(2);
    expect(messageOf(entries[1])).toContain('convertPhongToStandardPbrMaterial');
  });

  it('stays SILENT when the conversion loses nothing', () => {
    const entries = captureLog(() => {
      enableMaterialConversionGuards();
      convertSpecularGlossinessToStandardPbr(createStandardPbrMaterial(), createSpecularGlossinessPbrMaterial());
      convertPhongToStandardPbrMaterial(createPhongMaterial());
    });
    expect(entries).toEqual([]);
  });

  it('stays SILENT without the guard — the production default', () => {
    const entries = captureLog(() => convertPhongToStandardPbrMaterial(createPhongMaterial({ specularMap: texture })));
    expect(entries).toEqual([]);
  });
});
