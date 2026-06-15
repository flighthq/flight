export type RenderCacheRefreshOptions = {
  // Extra transparent margin, in source pixels, baked around the content on every side.
  // Gives effects such as blur room to bleed without clipping at the target edge.
  padding?: number;
  minWidth?: number;
  minHeight?: number;
};
