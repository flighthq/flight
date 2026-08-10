import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { formatCaptureConsoleMessage, listenForCaptureResourceFailures } from './captureResourceFailure';

describe('formatCaptureConsoleMessage', () => {
  it('adds the source URL when Chromium omits it from a resource error', () => {
    const message = {
      location: () => ({ url: 'https://flight.test/missing.png' }),
      text: () => 'Failed to load resource: the server responded with a status of 404',
    } as ConsoleMessage;

    expect(formatCaptureConsoleMessage(message)).toBe(
      'Failed to load resource: the server responded with a status of 404 (https://flight.test/missing.png)',
    );
  });

  it('does not repeat a URL already present in the message', () => {
    const message = {
      location: () => ({ url: 'https://flight.test/missing.png' }),
      text: () => 'resource failed: https://flight.test/missing.png',
    } as ConsoleMessage;

    expect(formatCaptureConsoleMessage(message)).toBe('resource failed: https://flight.test/missing.png');
  });
});

describe('listenForCaptureResourceFailures', () => {
  it('names HTTP and transport failures without duplicating one failed response', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const page = {
      on: vi.fn((event: string, listener: (event: unknown) => void) => {
        listeners.set(event, listener);
        return page;
      }),
    } as unknown as Page;
    const failures: string[] = [];
    listenForCaptureResourceFailures(page, (message) => failures.push(message));

    const missingRequest = {} as Request;
    listeners.get('response')?.({
      request: () => missingRequest,
      status: () => 404,
      statusText: () => 'Not Found',
      url: () => 'https://flight.test/missing.png',
    } as Response);
    listeners.get('requestfailed')?.(missingRequest);

    const transportRequest = {
      failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }),
      url: () => 'https://flight.test/dropped.png',
    } as Request;
    listeners.get('requestfailed')?.(transportRequest);

    expect(failures).toEqual([
      'resource load failed: https://flight.test/missing.png (HTTP 404 Not Found)',
      'resource load failed: https://flight.test/dropped.png (net::ERR_CONNECTION_RESET)',
    ]);
  });
});
