import { describe, it, expect } from 'vitest';
import { buildLipMesh } from '../lipMeshBuilder';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('LipMeshBuilder (Phase 3)', () => {
  it('builds a fixed mesh with canonical base and refined lip submesh', () => {
    const mockLandmarks: Point2D[] = Array.from({ length: 478 }, (_, i) => ({
      x: 0.5 + Math.sin(i * 0.1) * 0.2,
      y: 0.5 + Math.cos(i * 0.1) * 0.2,
      z: 0,
    }));

    mockLandmarks[61] = { x: 0.42, y: 0.65 };  // left corner
    mockLandmarks[291] = { x: 0.58, y: 0.65 }; // right corner
    mockLandmarks[0] = { x: 0.50, y: 0.63 };   // cupid's bow
    mockLandmarks[17] = { x: 0.50, y: 0.68 };  // lower vermilion
    mockLandmarks[13] = { x: 0.50, y: 0.645 }; // upper inner
    mockLandmarks[14] = { x: 0.50, y: 0.655 }; // lower inner

    const mesh1 = buildLipMesh(mockLandmarks);
    const mesh2 = buildLipMesh(mockLandmarks);

    expect(mesh1.vertices.length).toBeGreaterThan(478);
    expect(mesh1.triangles.length).toBeGreaterThan(700);
    expect(mesh1.triangles.length).toBe(mesh2.triangles.length);
    expect(mesh1.lipTriangleIndices.length).toBeGreaterThan(0);

    const cornerWeight = mesh1.weights[61];
    expect(cornerWeight.isMouthCorner).toBe(true);
    expect(cornerWeight.fullnessWeight).toBe(0);
    expect(cornerWeight.widthWeight).toBeGreaterThan(0);
  });
});
