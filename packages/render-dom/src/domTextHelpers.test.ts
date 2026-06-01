import { escapeHtmlString } from './domTextHelpers';

describe('escapeHtmlString', () => {
  it('escapes ampersands', () => {
    expect(escapeHtmlString('a&b')).toBe('a&amp;b');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtmlString('a>b')).toBe('a&gt;b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtmlString('a<b')).toBe('a&lt;b');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(escapeHtmlString('<a & b>')).toBe('&lt;a&nbsp;&amp;&nbsp;b&gt;');
  });

  it('escapes spaces to &nbsp;', () => {
    expect(escapeHtmlString('a b')).toBe('a&nbsp;b');
  });

  it('returns unchanged string when no special characters', () => {
    expect(escapeHtmlString('hello')).toBe('hello');
  });
});
