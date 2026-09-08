import { formatNetFormBody, NetFormContentType } from './netForm';

describe('formatNetFormBody', () => {
  it('encodes fields in insertion order with HTML form space semantics', () => {
    expect(formatNetFormBody({ query: 'flight sdk', redirect: 'https://example.test/a?x=1&y=2' })).toBe(
      'query=flight+sdk&redirect=https%3A%2F%2Fexample.test%2Fa%3Fx%3D1%26y%3D2',
    );
  });

  it('encodes form-unsafe punctuation and unicode', () => {
    expect(formatNetFormBody({ "!~'()": 'café' })).toBe('%21%7E%27%28%29=caf%C3%A9');
  });
});

describe('NetFormContentType', () => {
  it('declares the encoding produced by formatNetFormBody', () => {
    expect(NetFormContentType).toBe('application/x-www-form-urlencoded;charset=UTF-8');
  });
});
