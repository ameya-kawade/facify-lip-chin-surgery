import { Point2D } from '../tracking/landmarkSmoother';

export interface TrianglePoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
}

/**
 * Computes the 2D affine transform matrix [a, b, c, d, e, f]
 * that maps source points (x, y) to destination points (u, v):
 * [ u ] = [ a  c  e ] [ x ]
 * [ v ]   [ b  d  f ] [ y ]
 *                     [ 1 ]
 */
export function solveAffineTransform(
  src: TrianglePoints,
  dst: TrianglePoints
): [number, number, number, number, number, number] | null {
  const x0 = src.p0.x, y0 = src.p0.y;
  const x1 = src.p1.x, y1 = src.p1.y;
  const x2 = src.p2.x, y2 = src.p2.y;

  const u0 = dst.p0.x, v0 = dst.p0.y;
  const u1 = dst.p1.x, v1 = dst.p1.y;
  const u2 = dst.p2.x, v2 = dst.p2.y;

  const denom = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(denom) < 1e-10 || !Number.isFinite(denom)) {
    return null; // Collinear or degenerate source points
  }

  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / denom;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / denom;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / denom;

  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / denom;
  const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / denom;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / denom;

  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(c) ||
    !Number.isFinite(d) ||
    !Number.isFinite(e) ||
    !Number.isFinite(f)
  ) {
    return null;
  }

  return [a, b, c, d, e, f];
}

/**
 * Expands a triangle outward from its centroid by a tiny pixel amount
 * to prevent subpixel antialiasing seams / shimmer between adjacent triangles.
 */
export function expandTriangle(tri: TrianglePoints, amountPx: number = 0.5): TrianglePoints {
  const cx = (tri.p0.x + tri.p1.x + tri.p2.x) / 3;
  const cy = (tri.p0.y + tri.p1.y + tri.p2.y) / 3;

  function push(p: Point2D): Point2D {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: p.x + (dx / len) * amountPx,
      y: p.y + (dy / len) * amountPx,
    };
  }

  return {
    p0: push(tri.p0),
    p1: push(tri.p1),
    p2: push(tri.p2),
  };
}

/**
 * Warps ONE triangle from source coordinates to destination coordinates on canvas.
 *
 * @param ctx Target canvas 2D rendering context (or OffscreenCanvasRenderingContext2D)
 * @param sourceImage HTMLVideoElement, HTMLCanvasElement, or OffscreenCanvas
 * @param srcTriangle 3 points in source image pixel coordinates
 * @param dstTriangle 3 points in destination canvas pixel coordinates
 * @returns true if successfully warped, false if degenerate or skipped
 */
export function warpTriangle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sourceImage: CanvasImageSource,
  srcTriangle: TrianglePoints,
  dstTriangle: TrianglePoints
): boolean {
  const matrix = solveAffineTransform(srcTriangle, dstTriangle);
  if (!matrix) return false;

  // Expand the destination triangle clip region to eliminate subpixel seam shimmer
  const clipTri = expandTriangle(dstTriangle, 0.5);

  ctx.save();

  // 1. Trace and clip to expanded destination triangle path
  ctx.beginPath();
  ctx.moveTo(clipTri.p0.x, clipTri.p0.y);
  ctx.lineTo(clipTri.p1.x, clipTri.p1.y);
  ctx.lineTo(clipTri.p2.x, clipTri.p2.y);
  ctx.closePath();
  ctx.clip();

  // 2. Apply affine transform: mapping source triangle onto destination
  const [a, b, c, d, e, f] = matrix;
  ctx.transform(a, b, c, d, e, f);

  // 3. Draw full source image (only clipped triangle is rendered)
  ctx.drawImage(sourceImage, 0, 0);

  ctx.restore();
  return true;
}
