import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ColladaImportOptions,
  ColladaParseResult,
  ColladaUpAxis,
  ImportDiagnostic,
  Scene3DDocument,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
const Y_UP_ROOT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const Z_UP_ROOT = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
const X_UP_ROOT = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}
function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((entry) => entry.name === name || entry.name.endsWith(`:${name}`));
}
function text(element: XmlElement | undefined, name: string): string | null {
  return child(element, name)?.text.trim() || null;
}
function walk(element: XmlElement, visit: (entry: XmlElement) => void): void {
  visit(element);
  for (const entry of element.children) walk(entry, visit);
}

/** Parses COLLADA foundation metadata and coordinate conventions into a format-neutral document. */
export function parseCollada(xml: string, _options?: Readonly<ColladaImportOptions>): ColladaParseResult {
  const diagnostics: ImportDiagnostic[] = [];
  const document = emptyDocument();
  const root = parseXmlDocument(xml);
  if (root === null || !(root.name === 'COLLADA' || root.name.endsWith(':COLLADA'))) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'collada.invalid-document', 'parseCollada');
    return { document, diagnostics, upAxis: 'Y_UP', rootTransform: Y_UP_ROOT };
  }
  const asset = child(root, 'asset');
  const axis = text(asset, 'up_axis');
  const upAxis: ColladaUpAxis = axis === 'Z_UP' || axis === 'X_UP' ? axis : 'Y_UP';
  const rootTransform = upAxis === 'Z_UP' ? Z_UP_ROOT : upAxis === 'X_UP' ? X_UP_ROOT : Y_UP_ROOT;
  document.metadata = {
    copyright: text(asset, 'copyright'),
    generator: text(child(asset, 'contributor'), 'authoring_tool'),
    version: root.attributes.version ?? null,
  };
  if (upAxis !== 'Y_UP')
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'collada.coordinate-conversion',
      'parseCollada',
      { from: upAxis, to: 'Y_UP' },
    );
  walk(root, (element) => {
    if (element.name === 'profile_GLSL' || element.name === 'profile_CG')
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-profile',
        'parseCollada',
        { profile: element.name },
      );
    if (element.name.startsWith('instance_') && !element.attributes.url)
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: element.name },
      );
  });
  return { document, diagnostics, upAxis, rootTransform };
}
