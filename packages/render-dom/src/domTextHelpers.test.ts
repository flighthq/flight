import { htmlEscape } from './domTextHelpers';

describe('htmlEscape', () => {
  it('escapes ampersands', () => {
    expect(htmlEscape('a&b')).toBe('a&amp;b');
  });

  it('escapes greater-than signs', () => {
    expect(htmlEscape('a>b')).toBe('a&gt;b');
  });

  it('escapes less-than signs', () => {
    expect(htmlEscape('a<b')).toBe('a&lt;b');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(htmlEscape('<a & b>')).toBe('&lt;a&nbsp;&amp;&nbsp;b&gt;');
  });

  it('escapes spaces to &nbsp;', () => {
    expect(htmlEscape('a b')).toBe('a&nbsp;b');
  });

  it('returns unchanged string when no special characters', () => {
    expect(htmlEscape('hello')).toBe('hello');
  });
});
