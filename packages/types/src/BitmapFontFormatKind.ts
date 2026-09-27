/** Identifies a bitmap font descriptor format for detection and dispatch.
 *
 *  Open string alias: use a vendor-prefixed value (e.g. `'acme.MyFont'`) for a custom format so it cannot
 *  collide with a built-in kind string. */
export type BitmapFontFormatKind = string;
/** BMFont binary: the `BMF` magic followed by version 3. */
export const BitmapFontFormatKindBmFontBinary = 'BmFontBinary';
/** BMFont text: the line-oriented `info`/`common`/`page`/`char` grammar. */
export const BitmapFontFormatKindBmFontText = 'BmFontText';
/** BMFont XML: a document whose root element is `<font>`. */
export const BitmapFontFormatKindBmFontXml = 'BmFontXml';
/** BMFont JSON: an object carrying `common` and `chars`. */
export const BitmapFontFormatKindBmFontJson = 'BmFontJson';
