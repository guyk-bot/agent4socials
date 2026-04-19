import React from 'react';
import { Rectangle } from 'recharts';

/** Recharts `Rectangle` corners: top-left, top-right, bottom-right, bottom-left. */
const FLAT: [number, number, number, number] = [0, 0, 0, 0];

/**
 * Per-cell corner radius for one segment of a vertical stacked bar.
 * Bottom segment gets bottom corners; top segment gets top corners; single segment is fully rounded.
 */
export function stackedBarRadiusForDatum<T extends string>(
  payload: Record<string, unknown> | undefined,
  dataKey: T,
  stackKeysBottomToTop: readonly T[],
  r: number,
): [number, number, number, number] {
  if (!payload || stackKeysBottomToTop.length === 0) return FLAT;
  const cap = Math.max(0, r);
  if (cap === 0) return FLAT;

  let bottomIdx = -1;
  for (let i = 0; i < stackKeysBottomToTop.length; i++) {
    const k = stackKeysBottomToTop[i]!;
    const v = Number(payload[k as string] ?? 0);
    if (Number.isFinite(v) && v > 0) {
      bottomIdx = i;
      break;
    }
  }
  let topIdx = -1;
  for (let i = stackKeysBottomToTop.length - 1; i >= 0; i--) {
    const k = stackKeysBottomToTop[i]!;
    const v = Number(payload[k as string] ?? 0);
    if (Number.isFinite(v) && v > 0) {
      topIdx = i;
      break;
    }
  }
  if (bottomIdx < 0 || topIdx < 0) return FLAT;

  const di = stackKeysBottomToTop.indexOf(dataKey);
  if (di < 0) return FLAT;

  const isBottom = di === bottomIdx;
  const isTop = di === topIdx;
  if (isTop && isBottom) return [cap, cap, cap, cap];
  if (isTop) return [cap, cap, 0, 0];
  if (isBottom) return [0, 0, cap, cap];
  return FLAT;
}

export type MinWidthStackedBarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, unknown>;
  dataKey?: string | number;
};

export function createMinWidthStackedBarShape(
  stackKeysBottomToTop: readonly string[],
  opts?: { radius?: number; minWidth?: number },
): (props: MinWidthStackedBarShapeProps) => React.ReactElement {
  const r = opts?.radius ?? 6;
  const minWidth = opts?.minWidth ?? 10;

  function MinWidthStackedBarShape(props: MinWidthStackedBarShapeProps): React.ReactElement {
    const x = typeof props.x === 'number' ? props.x : 0;
    const y = typeof props.y === 'number' ? props.y : 0;
    const width = typeof props.width === 'number' ? props.width : 0;
    const height = typeof props.height === 'number' ? props.height : 0;
    const fill = props.fill ?? '#8884d8';
    const adjustedWidth = Math.max(width, minWidth);
    const adjustedX = x - (adjustedWidth - width) / 2;
    const normalizedHeight = Math.abs(height);
    const normalizedY = height >= 0 ? y : y + height;
    const dk = String(props.dataKey ?? '');
    const radius = stackedBarRadiusForDatum(props.payload, dk, stackKeysBottomToTop, r);

    return (
      <Rectangle
        x={adjustedX}
        y={normalizedY}
        width={adjustedWidth}
        height={normalizedHeight}
        fill={fill}
        radius={radius}
        stroke="none"
        opacity={normalizedHeight > 0 ? 1 : 0}
      />
    );
  }

  MinWidthStackedBarShape.displayName = 'MinWidthStackedBarShape';
  return MinWidthStackedBarShape;
}
