export interface GridSliceOptions {
  /** Number of columns in the grid. */
  columns: number;
  /** Height of each frame in pixels. Derived from imageHeight, rows, margin, and spacing when omitted. */
  frameHeight?: number;
  /** Width of each frame in pixels. Derived from imageWidth, columns, margin, and spacing when omitted. */
  frameWidth?: number;
  /** Relative path or URL to the atlas image file. */
  imageFile: string;
  /** Total height of the atlas image in pixels. */
  imageHeight: number;
  /** Total width of the atlas image in pixels. */
  imageWidth: number;
  /** Uniform outer margin on all sides in pixels. Defaults to 0. */
  marginX?: number;
  /** Uniform outer margin on top and bottom in pixels. Defaults to 0. */
  marginY?: number;
  /** Prefix prepended to each generated frame name. Defaults to 'frame_'. */
  namePrefix?: string;
  /** Number of rows in the grid. */
  rows: number;
  /** Horizontal gap between adjacent columns in pixels. Defaults to 0. */
  spacingX?: number;
  /** Vertical gap between adjacent rows in pixels. Defaults to 0. */
  spacingY?: number;
}
