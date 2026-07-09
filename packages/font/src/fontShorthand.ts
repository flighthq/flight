export function getFontShorthand(family: string, style?: string): string {
  // Backslash-escape backslashes and single quotes so a family name containing either
  // cannot break out of the quoted CSS string in the `font` shorthand.
  const quoted = `'${family.replace(/[\\']/g, '\\$&')}'`;
  return style !== undefined && style !== '' ? `${style} 1em ${quoted}` : `1em ${quoted}`;
}
