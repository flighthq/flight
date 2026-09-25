import { describe, expect, it } from 'vitest';

import { classifyPublishError } from './publish-error-kind.js';

// The exact stderr observed from a concurrent publish of @flighthq/capture. Kept verbatim: this
// classifier exists because of this text, and a paraphrase would not prove it is matched.
const OBSERVED_STARTUP_RACE = `Exit prior to config file resolving
cause
call config.load() before reading values

Command failed: npm publish --access public --ignore-scripts --tag next
Exit prior to config file resolving
cause
call config.load() before reading values
`;

const OBSERVED_EMPTY_RESPONSE = `npm error code EJSONPARSE
npm error JSON.parse Invalid package.json: JSONParseError: Unexpected end of JSON input while parsing empty string
npm error JSON.parse Failed to parse JSON data.
npm error JSON.parse Note: package.json must be actual JSON, not just JavaScript.
npm error Log files were not written due to the config logs-max=0
Command failed: npm publish --access public --ignore-scripts --tag next
npm error code EJSONPARSE
npm error JSON.parse Invalid package.json: JSONParseError: Unexpected end of JSON input while parsing empty string
npm error JSON.parse Failed to parse JSON data.
npm error JSON.parse Note: package.json must be actual JSON, not just JavaScript.
npm error Log files were not written due to the config logs-max=0`;

describe('classifyPublishError', () => {
  it('classifies the observed npm startup race as transient', () => {
    expect(classifyPublishError(OBSERVED_STARTUP_RACE)).toBe('transient');
  });

  it('classifies each half of the startup race independently', () => {
    // npm prints these together, but a truncated capture must still be recognised.
    expect(classifyPublishError('Exit prior to config file resolving')).toBe('transient');
    expect(classifyPublishError('call config.load() before reading values')).toBe('transient');
  });

  it('classifies registry throttling as rate-limited', () => {
    expect(classifyPublishError('npm ERR! 429 Too Many Requests')).toBe('rate-limited');
    expect(classifyPublishError('rate limit exceeded')).toBe('rate-limited');
  });

  it('classifies a duplicate version as already-published', () => {
    expect(classifyPublishError('npm ERR! code EPUBLISHCONFLICT')).toBe('already-published');
    expect(classifyPublishError('You cannot publish over the previously published versions: 0.3.0')).toBe(
      'already-published',
    );
  });

  it('ranks already-published above rate-limited when both appear', () => {
    // A retry after throttling can surface both; the publish is done either way, so it must not be
    // retried again into a hard failure.
    expect(classifyPublishError('429 Too Many Requests\nEPUBLISHCONFLICT')).toBe('already-published');
  });

  it('classifies real rejections as fatal, so they are never retried into a false success', () => {
    expect(classifyPublishError('npm ERR! code E403\nnpm ERR! 403 Forbidden - PUT ...')).toBe('fatal');
    expect(classifyPublishError('npm ERR! code ENEEDAUTH')).toBe('fatal');
    expect(classifyPublishError('npm ERR! Tarball is not a bzip2 archive')).toBe('fatal');
    expect(classifyPublishError('')).toBe('fatal');
  });

  it('classifies the observed EJSONPARSE empty-response error as transient', () => {
    expect(classifyPublishError(OBSERVED_EMPTY_RESPONSE)).toBe('transient');
  });

  it('classifies each EJSONPARSE variant independently', () => {
    expect(classifyPublishError('npm error code EJSONPARSE\nUnexpected end of JSON input')).toBe('transient');
    expect(
      classifyPublishError('EJSONPARSE\nJSONParseError: Unexpected end of JSON input while parsing empty string'),
    ).toBe('transient');
  });

  it('does not treat a genuine EJSONPARSE from a malformed manifest as transient', () => {
    expect(classifyPublishError('npm ERR! code ESYNTAX\nnpm ERR! Unexpected token } in JSON at position 42')).toBe(
      'fatal',
    );
  });

  it('does not treat an ordinary config mention as a startup race', () => {
    // Guards the loosest term in the pattern: "config" alone must not trigger a retry.
    expect(classifyPublishError('npm ERR! could not read config file')).toBe('fatal');
  });
});
