import { describe, it, expect } from 'vitest';
import { solveAffineTransform, warpTriangle, TrianglePoints } from '../triangleWarp';
import { renderWarpedFrame } from '../imageWarper';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('Triangle Warp Affine Solver (Phase 5 & 6)', () => {
  it('solves identity transform when source and destination are identical', () => {
    const tri: TrianglePoints = {
      p0: { x: 0, y: 0 },
      p1: { x: 10, y: 0 },
      p2: { x: 0, y: 10 },
    };

    const matrix = solveAffineTransform(tri, tri);
    expect(matrix).not.toBeNull();
    if (!matrix) return;
    const [a, b, c, d, e, f] = matrix;
    expect(a).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(0, 5);
    expect(d).toBeCloseTo(1, 5);
    expect(e).toBeCloseTo(0, 5);
    expect(f).toBeCloseTo(0, 5);
  });

  it('correctly maps translated source triangle onto destination', () => {
    const src: TrianglePoints = {
      p0: { x: 10, y: 10 },
      p1: { x: 20, y: 10 },
      p2: { x: 10, y: 30 },
    };
    const dx = 5, dy = -3;
    const dst: TrianglePoints = {
      p0: { x: 10 + dx, y: 10 + dy },
      p1: { x: 20 + dx, y: 10 + dy },
      p2: { x: 10 + dx, y: 30 + dy },
    };

    const matrix = solveAffineTransform(src, dst);
    expect(matrix).not.toBeNull();
    if (!matrix) return;
    const [a, b, c, d, e, f] = matrix;
    expect(a).toBeCloseTo(1, 4);
    expect(b).toBeCloseTo(0, 4);
    expect(c).toBeCloseTo(0, 4);
    expect(d).toBeCloseTo(1, 4);
    expect(e).toBeCloseTo(dx, 4);
    expect(f).toBeCloseTo(dy, 4);
  });

  it('returns null for degenerate collinear points and warpTriangle reports false', () => {
    const degenerate: TrianglePoints = {
      p0: { x: 0, y: 0 },
      p1: { x: 5, y: 5 },
      p2: { x: 10, y: 10 },
    };
    const dst: TrianglePoints = {
      p0: { x: 0, y: 0 },
      p1: { x: 5, y: 0 },
      p2: { x: 5, y: 5 },
    };
    const matrix = solveAffineTransform(degenerate, dst);
    expect(matrix).toBeNull();

    // Fake context mock
    const fakeCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clip: () => {},
      transform: () => {},
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;

    const fakeImage = {} as CanvasImageSource;
    const success = warpTriangle(fakeCtx, fakeImage, degenerate, dst);
    expect(success).toBe(false);
  });

  it('executes identity fast path directly without warping triangles', () => {
    let drawCount = 0;
    const fakeCtx = {
      drawImage: () => { drawCount++; },
    } as unknown as CanvasRenderingContext2D;

    const mockLandmarks: Point2D[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    const mesh = buildLipMesh(mockLandmarks);

    const diag = renderWarpedFrame(
      fakeCtx,
      {} as CanvasImageSource,
      640,
      480,
      mockLandmarks,
      mockLandmarks,
      mesh,
      { isIdentity: true }
    );

    expect(drawCount).toBe(1);
    expect(diag.activeTriangles).toBe(0);
    expect(diag.renderedTriangles).toBe(0);
    expect(diag.skippedTriangles).toBe(0);
    expect(diag.maxDisplacementPx).toBe(0);
  });
});
