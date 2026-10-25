import { describe, it, expect } from 'vitest';
import { resolveMeshPositions } from '../resolveMeshPositions';
import { buildLipMesh, CompleteMesh } from '../lipMeshBuilder';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('resolveMeshPositions (Phase 1 Contract)', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + Math.sin(i) * 0.1,
    y: 0.5 + Math.cos(i) * 0.1,
  }));

  const mesh: CompleteMesh = buildLipMesh(mockLandmarks);

  it('resolves canonical vertices to the current landmark positions', () => {
    const resolved = resolveMeshPositions(mockLandmarks, mesh);
    expect(resolved).not.toBeNull();
    expect(resolved!.length).toBe(mesh.vertices.length);

    // Verify first 478 canonical vertices match landmarks exactly
    for (let i = 0; i < 478; i++) {
      expect(resolved![i].x).toBeCloseTo(mockLandmarks[i].x, 6);
      expect(resolved![i].y).toBeCloseTo(mockLandmarks[i].y, 6);
    }
  });

  it('interpolates synthetic vertices from parent landmarks with configured weights', () => {
    const resolved = resolveMeshPositions(mockLandmarks, mesh);
    expect(resolved).not.toBeNull();

    // Check synthetic vertices (indices >= 478)
    for (let i = 478; i < mesh.vertices.length; i++) {
      const v = mesh.vertices[i];
      if (v.parentA !== undefined && v.parentB !== undefined && v.weightA !== undefined) {
        const expectedX = mockLandmarks[v.parentA].x * v.weightA + mockLandmarks[v.parentB].x * (1 - v.weightA);
        const expectedY = mockLandmarks[v.parentA].y * v.weightA + mockLandmarks[v.parentB].y * (1 - v.weightA);
        expect(resolved![i].x).toBeCloseTo(expectedX, 5);
        expect(resolved![i].y).toBeCloseTo(expectedY, 5);
      }
    }
  });

  it('fails safely (returns null) on missing, empty, or out-of-bounds landmarks', () => {
    expect(resolveMeshPositions([], mesh)).toBeNull();
    expect(resolveMeshPositions(null as unknown as Point2D[], mesh)).toBeNull();

    // Incomplete landmarks array (shorter than canonical count)
    const shortLandmarks = mockLandmarks.slice(0, 100);
    expect(resolveMeshPositions(shortLandmarks, mesh)).toBeNull();
  });

  it('fails safely (returns null) on non-finite coordinates', () => {
    const corruptedLandmarks = [...mockLandmarks];
    corruptedLandmarks[10] = { x: NaN, y: 0.5 };
    expect(resolveMeshPositions(corruptedLandmarks, mesh)).toBeNull();

    corruptedLandmarks[10] = { x: 0.5, y: Infinity };
    expect(resolveMeshPositions(corruptedLandmarks, mesh)).toBeNull();
  });
});
