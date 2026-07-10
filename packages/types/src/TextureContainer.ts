import type { TextureContainerFormat } from './TextureContainerFormat';
import type { TextureContainerLevel } from './TextureContainerLevel';
import type { TextureContainerSupercompression } from './TextureContainerSupercompression';

// A parsed GPU texture container (KTX2 / DDS / Basis): what format it holds, its full dimensions, and
// where every sub-image lives — without decoding the compressed payload. The common descriptor all
// three `parse*` front-ends produce, so a caller routes level byte ranges to a GPU upload or a
// `flight-rs` transcoder against one shape regardless of source container.
//
// `width`/`height`/`depth` are the base (mip 0) dimensions (`depth` is 1 for 2D). `mipLevels`,
// `layers` (array slices; 1 for non-array), and `faces` (6 for a cubemap, else 1) give the container's
// shape. `levels` is the flat list of every stored sub-image: for a non-supercompressed container it
// holds `mipLevels * layers * faces` entries (each face/layer split out as its own contiguous range);
// for a supercompressed KTX2 it holds one entry per mip level covering the whole compressed blob
// (a supercompressed level cannot be split per image without inflating it first). Entry order matches
// the source container's native layout — see each `parse*` function for the exact nesting.
export interface TextureContainer {
  readonly format: TextureContainerFormat;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly mipLevels: number;
  readonly layers: number;
  readonly faces: number;
  readonly supercompression: TextureContainerSupercompression;
  readonly levels: readonly TextureContainerLevel[];
}
