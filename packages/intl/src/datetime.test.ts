import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatTime } from './datetime';

// A fixed instant (2020-01-15T13:05:00Z). Assertions pass an explicit
// `timeZone: 'UTC'` so they are deterministic regardless of the host time zone.
const instant = new Date(Date.UTC(2020, 0, 15, 13, 5, 0));

describe('formatDate', () => {
  it('orders numeric fields per locale', () => {
    const utc = { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' } as const;
    expect(formatDate(instant, 'en-US', utc)).toBe('1/15/2020');
    expect(formatDate(instant, 'de-DE', utc)).toBe('15.1.2020');
  });

  it('renders a string with the default field set', () => {
    expect(typeof formatDate(instant, 'en-US')).toBe('string');
  });

  it('passes an invalid Date through as Intl does', () => {
    expect(formatDate(new Date(NaN), 'en-US')).toBe('Invalid Date');
  });
});

describe('formatDateTime', () => {
  it('includes both the date and the time', () => {
    const utc = {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      timeZone: 'UTC',
    } as const;
    const result = formatDateTime(instant, 'en-US', utc);
    expect(result).toContain('1/15/2020');
    expect(result).toContain('1:05');
  });
});

describe('formatTime', () => {
  it('formats the time per locale clock convention', () => {
    const utc = { hour: 'numeric', minute: 'numeric', timeZone: 'UTC' } as const;
    expect(formatTime(instant, 'en-US', utc)).toBe('1:05 PM');
    expect(formatTime(instant, 'de-DE', utc)).toBe('13:05');
  });
});
