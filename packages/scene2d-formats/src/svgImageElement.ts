import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Node2D, SvgElementContext, SvgImportContext, SvgStyle, XmlElement } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { applySvgElementClip } from './svgClip.ts';
import { applySvgElementAppearance } from './svgDocument.ts';
import { createSvgViewBoxMatrix } from './svgTransform.ts';
import { svgAttribute, svgNumberAttribute } from './svgXml.ts';

/**
 * The `<image>` element: a sprite over the texture the caller's resolver returns.
 *
 * ★ THE RESOLVER IS THE CALLER'S, AND ITS ABSENCE IS NOT AN ERROR. An `href` the caller cannot resolve is a skip — the
 * document is intact and the image simply was not supplied — while a missing `href` is a document defect and drops.
 * Keeping both here is why a build without the image family links neither the sprite nor `@flighthq/texture`.
 */
export function svgImageElementHandler(context: SvgElementContext): Node2D | null {
  return createSvgImageNode(context.element, context.parentStyle, context.import);
}

function createSvgImageNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const href = svgAttribute(element, 'href');
  // THREE DISTINGUISHABLE CAUSES, and the third is not the caller's document at all. Splitting them here
  // because the site CAN tell them apart: a caller who never wired `resolveImageResource` used to read
  // "your file lost data" when the truth is "you did not wire the integration", which is a diagnosability
  // defect wearing a severity question.
  //
  // All three are Drop. Images ARE supported, so none is a capability gap, and nothing stands in for the
  // missing picture either way — Skip would claim a recognition we do not have.
  const resolver = context.options?.resolveImageResource;
  const image = href === null || resolver === undefined ? null : (resolver(href) ?? null);
  if (href === null || image === null) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      href === null
        ? 'svg.image-missing-href'
        : resolver === undefined
          ? 'svg.image-resolver-unwired'
          : 'svg.unresolved-image',
      'createSvgImageNode',
      href === null ? undefined : { href },
    );
    return null;
  }

  const width = svgNumberAttribute(element, 'width', image.width);
  const height = svgNumberAttribute(element, 'height', image.height);
  const x = svgNumberAttribute(element, 'x', 0);
  const y = svgNumberAttribute(element, 'y', 0);
  const bitmap = createSprite({
    data: { texture: createTexture({ dimension: '2d', source: image }) },
  });
  const geometry =
    image.width > 0 && image.height > 0 && width >= 0 && height >= 0
      ? createSvgViewBoxMatrix(
          [0, 0, image.width, image.height],
          { height, width, x, y },
          svgAttribute(element, 'preserveAspectRatio') ?? 'xMidYMid meet',
        )
      : createMatrix(1, 0, 0, 1, x, y);
  applySvgElementAppearance(bitmap, element, parentStyle, context, geometry);
  const bounds = createRectangle(0, 0, image.width, image.height);
  applySvgElementClip(bitmap, element, context, bounds);
  return bitmap;
}
