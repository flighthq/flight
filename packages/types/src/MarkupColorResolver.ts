// Resolves a `<font color>` attribute value to a packed 24-bit RGB integer, or null when unrecognized.
// The color seam a `MarkupTagRegistry` carries and the standard `<font>` handler consults: the standard
// dialect installs a hex-only resolver (`#rgb`/`#rrggbb`/`0x`), and `registerMarkupNamedColors` swaps in
// one that also resolves the CSS named-color keywords. Keeping color parsing behind this seam is what
// lets the ~148-entry named-color table stay out of a bundle that never opts into it — only the named
// resolver imports the table, so a font handler restricted to hex never pulls it in.
export type MarkupColorResolver = (value: string) => number | null;
