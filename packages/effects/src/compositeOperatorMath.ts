import { CompositeOperator } from '@flighthq/types';

// Premultiplied Porter-Duff coverage factors — the substrate-agnostic ground truth for how an isolated
// layer (`source`) merges into its backdrop. The composited pixel is `Fa*source + Fb*backdrop` applied to
// premultiplied color (rgb and a alike), where Fa/Fb depend only on the operator and the two coverage
// alphas (`sourceAlpha` = as, `backdropAlpha` = ab). The GL fixed-function blendFunc factor pairs and the
// Canvas globalCompositeOperation names both mirror these, so every backend is verifiable against plain
// numbers. This is a closed set (the eleven Porter-Duff operators); custom operators are wired per-backend
// (registerGlCompositeOperator) with their own factors, so an unknown operator here falls through to
// SourceOver. Writes [Fa, Fb] into `out`; alias-safe (reads inputs before writing).
export function getCompositeOperatorFactors(
  operator: CompositeOperator,
  sourceAlpha: number,
  backdropAlpha: number,
  out: [number, number] | Float32Array | number[],
): void {
  const as = sourceAlpha;
  const ab = backdropAlpha;
  let fa: number;
  let fb: number;
  switch (operator) {
    case CompositeOperator.Clear:
      fa = 0;
      fb = 0;
      break;
    case CompositeOperator.Copy:
      fa = 1;
      fb = 0;
      break;
    case CompositeOperator.DestinationAtop:
      fa = 1 - ab;
      fb = as;
      break;
    case CompositeOperator.DestinationIn:
      fa = 0;
      fb = as;
      break;
    case CompositeOperator.DestinationOut:
      fa = 0;
      fb = 1 - as;
      break;
    case CompositeOperator.DestinationOver:
      fa = 1 - ab;
      fb = 1;
      break;
    case CompositeOperator.SourceAtop:
      fa = ab;
      fb = 1 - as;
      break;
    case CompositeOperator.SourceIn:
      fa = ab;
      fb = 0;
      break;
    case CompositeOperator.SourceOut:
      fa = 1 - ab;
      fb = 0;
      break;
    case CompositeOperator.Xor:
      fa = 1 - ab;
      fb = 1 - as;
      break;
    default:
      // SourceOver: source over backdrop.
      fa = 1;
      fb = 1 - as;
      break;
  }
  out[0] = fa;
  out[1] = fb;
}
