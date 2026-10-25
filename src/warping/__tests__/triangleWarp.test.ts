import { describe, it, expect } from 'vitest';
import { solveAffineTransform, TrianglePoints } from '../triangleWarp';

describe('Triangle Warp Affine Solver (Phase 5)', () => {
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

  it('returns null for degenerate collinear points', () => {
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
  });
});
