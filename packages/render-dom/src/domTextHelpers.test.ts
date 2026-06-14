import { escapeHTMLString } from './domTextHelpers';

describe('escapeHTMLString', () => {
  it('escapes ampersands', () => {
    expect(escapeHTMLString('a&b')).toBe('a&amp;b');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHTMLString('a>b')).toBe('a&gt;b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHTMLString('a<b')).toBe('a&lt;b');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(escapeHTMLString('<a & b>')).toBe('&lt;a&nbsp;&amp;&nbsp;b&gt;');
  });

  it('escapes spaces to &nbsp;', () => {
    expect(escapeHTMLString('a b')).toBe('a&nbsp;b');
  });

  it('returns unchanged string when no special characters', () => {
    expect(escapeHTMLString('hello')).toBe('hello');
  });
});
