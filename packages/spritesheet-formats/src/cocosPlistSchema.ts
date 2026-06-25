// Cocos Creator / Cocos2d-x plist atlas schema — field names as they appear in the plist file.
// Supports both old-style keys (frame, offset, sourceSize, size, rotated, trimmed) and
// new-style sprite-prefixed keys (textureRect, spriteOffset, spriteSourceSize, spriteSize,
// textureRotated, spriteTrimmed). The parser normalises both variants into this shape.

export interface CocosPlistFrame {
  /** Rect of this frame in the atlas, as a plist string "{{x,y},{w,h}}". */
  frame: string;
  /** Pixel offset of the trimmed sprite within its original bounds, as a plist string "{x,y}". */
  spriteOffset: string;
  /** Trimmed size of this frame in the atlas, as a plist string "{w,h}". */
  spriteSize: string;
  /** Original (untrimmed) size of the source sprite, as a plist string "{w,h}". */
  spriteSourceSize: string;
  /** Whether the sprite was trimmed to remove transparent borders. */
  spriteTrimmed: boolean;
  /** Whether the frame is rotated 90 degrees clockwise in the atlas. */
  textureRotated: boolean;
  /** Optional aliases (alternate names) for this frame. */
  aliases?: string[];
}

export interface CocosPlistMetadata {
  /** Plist format version (2 = old-style, 3 = new-style sprite-prefixed keys). */
  format: number;
  /** Size of the atlas texture, as a plist string "{w,h}". */
  size: string;
  /** File name of the atlas texture image. */
  textureFileName: string;
}

export interface CocosPlistDocument {
  /** Map of frame name to frame descriptor. */
  frames: Record<string, CocosPlistFrame>;
  /** Atlas metadata. */
  metadata: CocosPlistMetadata;
}
