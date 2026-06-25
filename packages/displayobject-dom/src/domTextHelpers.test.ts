import { escapeDomHtmlString } from './domTextHelpers';

describe('escapeDomHtmlString', () => {
  it('escapes ampersands', () => {
    expect(escapeDomHtmlString('a&b')).toBe('a&amp;b');
  });

  it('escapes greater-than signs', () => {
    expect(escapeDomHtmlString('a>b')).toBe('a&gt;b');
  });

  it('escapes less-than signs', () => {
    expect(escapeDomHtmlString('a<b')).toBe('a&lt;b');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(escapeDomHtmlString('<a & b>')).toBe('&lt;a&nbsp;&amp;&nbsp;b&gt;');
  });

  it('escapes spaces to &nbsp;', () => {
    expect(escapeDomHtmlString('a b')).toBe('a&nbsp;b');
  });

  it('returns unchanged string when no special characters', () => {
    expect(escapeDomHtmlString('hello')).toBe('hello');
  });
});
