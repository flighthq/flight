import type { ShapeCommandToken } from '@flighthq/types/contract';

export function writeShapeGeometryCommandEnd(
  out: { x: number; y: number },
  currentX: number,
  currentY: number,
  name: string,
  commands: readonly ShapeCommandToken[],
  argumentIndex: number,
): boolean {
  switch (name) {
    case 'moveTo':
    case 'lineTo':
      out.x = commands[argumentIndex] as number;
      out.y = commands[argumentIndex + 1] as number;
      return true;
    case 'quadraticCurveTo':
      out.x = commands[argumentIndex + 2] as number;
      out.y = commands[argumentIndex + 3] as number;
      return true;
    case 'cubicCurveTo':
      out.x = commands[argumentIndex + 4] as number;
      out.y = commands[argumentIndex + 5] as number;
      return true;
    case 'drawCircle':
    case 'drawEllipse':
      out.x = (commands[argumentIndex] as number) + (commands[argumentIndex + 2] as number);
      out.y = commands[argumentIndex + 1] as number;
      return true;
    case 'drawRectangle':
      out.x = commands[argumentIndex] as number;
      out.y = commands[argumentIndex + 1] as number;
      return true;
    case 'drawRoundedRectangle': {
      const radius = Math.max(
        0,
        Math.min(
          commands[argumentIndex + 4] as number,
          Math.abs(commands[argumentIndex + 2] as number) / 2,
          Math.abs(commands[argumentIndex + 3] as number) / 2,
        ),
      );
      out.x = (commands[argumentIndex] as number) + radius;
      out.y = commands[argumentIndex + 1] as number;
      return true;
    }
    case 'drawPath':
      writeRawPathEnd(
        out,
        currentX,
        currentY,
        commands[argumentIndex] as readonly number[],
        commands[argumentIndex + 1] as readonly number[],
      );
      return true;
    default:
      return false;
  }
}

function writeRawPathEnd(
  out: { x: number; y: number },
  currentX: number,
  currentY: number,
  pathCommands: readonly number[],
  data: readonly number[],
): void {
  let dataIndex = 0;
  let subpathStartX = currentX;
  let subpathStartY = currentY;
  out.x = currentX;
  out.y = currentY;
  for (const command of pathCommands) {
    switch (command) {
      case 1:
        out.x = subpathStartX = data[dataIndex];
        out.y = subpathStartY = data[dataIndex + 1];
        dataIndex += 2;
        break;
      case 2:
        out.x = data[dataIndex];
        out.y = data[dataIndex + 1];
        dataIndex += 2;
        break;
      case 3:
        out.x = data[dataIndex + 2];
        out.y = data[dataIndex + 3];
        dataIndex += 4;
        break;
      case 4:
        out.x = subpathStartX = data[dataIndex + 2];
        out.y = subpathStartY = data[dataIndex + 3];
        dataIndex += 4;
        break;
      case 5:
        out.x = data[dataIndex + 2];
        out.y = data[dataIndex + 3];
        dataIndex += 4;
        break;
      case 6:
        out.x = data[dataIndex + 4];
        out.y = data[dataIndex + 5];
        dataIndex += 6;
        break;
      case 7:
        out.x = subpathStartX;
        out.y = subpathStartY;
        break;
    }
  }
}
