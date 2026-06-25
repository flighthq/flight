/** Per-frame GPU draw statistics for a WgpuRenderState, populated by the batch and draw paths. */
export interface WgpuRenderStats {
  /** Number of GPU draw calls issued this frame. */
  readonly drawCallCount: number;
  /** Total sprite/quad/particle instances drawn this frame. */
  readonly instanceCount: number;
  /** Number of sprite-batch flushes triggered this frame. */
  readonly batchFlushCount: number;
  /** Number of canvas-to-GPU texture uploads issued this frame. */
  readonly textureUploadCount: number;
}
