import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Matrix } from './Matrix.ts';
import type { Node2D } from './Node2D.ts';
import type { Rectangle } from './Rectangle.ts';
import type { PathWinding, SpreadMethod } from './ShapeCommand.ts';
import type { SvgDocumentImportOptions } from './SvgDocumentImport.ts';
import type { XmlElement } from './XmlElement.ts';

export const SvgElementKind = {
  Container: 'container',
  Geometry: 'geometry',
  Image: 'image',
  Text: 'text',
  Use: 'use',
} as const;

export type SvgElementKind = string;

export interface SvgColor {
  alpha: number;
  rgb: number;
}

export interface SvgCssRule {
  declarations: Record<string, string>;
  order: number;
  selector: string;
  specificity: number;
}

export interface SvgElementContext {
  element: Readonly<XmlElement>;
  import: SvgImportContext;
  parentStyle: Readonly<SvgStyle>;
}

export type SvgElementHandler = (context: SvgElementContext) => Node2D | null;

export interface SvgElementHandlerEntry {
  handle: SvgElementHandler;
  kind: SvgElementKind;
}

export interface SvgGradient {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  kind: 'linear' | 'radial';
  radius: number;
  spreadMethod: SpreadMethod;
  stops: SvgGradientStop[];
  transform: Matrix | null;
  units: 'objectBoundingBox' | 'userSpaceOnUse';
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface SvgGradientStop {
  color: SvgColor;
  offset: number;
}

export interface SvgImportContext {
  cssRules: SvgCssRule[];
  diagnostics: ImportDiagnostic[] | undefined;
  elementsById: Map<string, XmlElement>;
  gradientsById: Map<string, SvgGradient>;
  objectBoundingBoxes: Map<Node2D, Rectangle>;
  options: Readonly<SvgDocumentImportOptions> | undefined;
  parentByElement: Map<XmlElement, XmlElement | null>;
  registry: Readonly<SvgRegistry>;
  reportedUnsupportedElements: Set<XmlElement>;
  resolvedDefinitionStyles: Map<XmlElement, SvgStyle>;
  resolvingClipUses: Set<string>;
  resolvingClips: Set<string>;
  resolvingGradients: Set<string>;
  resolvingUses: Set<string>;
}

export interface SvgRegistry {
  elementHandlers: SvgElementHandlerEntry[];
}

export interface SvgStyle {
  clipRule: PathWinding;
  color: string;
  display: string;
  fill: string;
  fillOpacity: number;
  fillRule: PathWinding;
  filter: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontWeight: string;
  opacity: number;
  stroke: string;
  strokeDasharray: string;
  strokeDashoffset: number;
  strokeLinecap: string;
  strokeLinejoin: string;
  strokeMiterlimit: number;
  strokeOpacity: number;
  strokeWidth: number;
  textAnchor: string;
  visibility: string;
}
