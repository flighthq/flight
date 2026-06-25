// The color gamut a display covers. 'srgb' is the default; 'display-p3' and 'rec2020' are the wider
// gamuts reported through the CSS color-gamut media query (or a native host's display metadata).
export type ScreenColorSpace = 'display-p3' | 'rec2020' | 'srgb';
