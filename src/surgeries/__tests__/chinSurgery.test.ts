import { describe, it, expect } from 'vitest';
import { deformChinMesh } from '../chinSurgery';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../../mesh/chinControlPoints';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('ChinSurgery Deformation Engine', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  // Setup realistic chin & lower face landmark coordinates
  mockLandmarks[18] = { x: 0.50, y: 0.70 };   // mentolabial fold
  mockLandmarks[199] = { x: 0.50, y: 0.80 };  // pogonion
  mockLandmarks[175] = { x: 0.50, y: 0.82 };  // pogonion lower
  mockLandmarks[152] = { x: 0.50, y: 0.88 };  // gnathion / chin tip apex
  mockLandmarks[148] = { x: 0.42, y: 0.84 };  // left lower border
  mockLandmarks[377] = { x: 0.58, y: 0.84 };  // right lower border
  mockLandmarks[172] = { x: 0.38, y: 0.80 };  // left lateral tubercle
  mockLandmarks[397] = { x: 0.62, y: 0.80 };  // right lateral tubercle
  mockLandmarks[10]  = { x: 0.50, y: 0.15 };  // forehead top

  const baseMesh = buildLipMesh(mockLandmarks);

  it('lengthens chin vertically on positive verticalLength', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex; // 152

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: 15, projection: 0, chinWidth: 0 },
      1.0
    );

    // Tip moves downward (y increases)
    expect(deformed[apexIdx].y).toBeGreaterThan(mockLandmarks[apexIdx].y);
    // Tip remains horizontally centered
    expect(deformed[apexIdx].x).toBeCloseTo(mockLandmarks[apexIdx].x, 5);
  });

  it('shortens chin vertically on negative verticalLength', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: -15, projection: 0, chinWidth: 0 },
      1.0
    );

    // Tip moves upward (y decreases)
    expect(deformed[apexIdx].y).toBeLessThan(mockLandmarks[apexIdx].y);
  });

  it('strictly preserves the mentolabial fold and lower lip (zero displacement)', () => {
    const mentolabialIdx = 18;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: 15, projection: 15, chinWidth: 15 },
      1.0
    );

    expect(deformed[mentolabialIdx].x).toBe(mockLandmarks[mentolabialIdx].x);
    expect(deformed[mentolabialIdx].y).toBe(mockLandmarks[mentolabialIdx].y);
  });

  it('tapers chin inwards symmetrically for V-line (negative chinWidth)', () => {
    const leftTubercle = 172;
    const rightTubercle = 397;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: 0, projection: 0, chinWidth: -15 },
      1.0
    );

    // Left shifts rightwards toward center (x increases)
    expect(deformed[leftTubercle].x).toBeGreaterThan(mockLandmarks[leftTubercle].x);
    // Right shifts leftwards toward center (x decreases)
    expect(deformed[rightTubercle].x).toBeLessThan(mockLandmarks[rightTubercle].x);
  });

  it('leaves non-chin vertices (forehead, nose) completely untouched', () => {
    const foreheadIdx = 10;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: 15, projection: 15, chinWidth: 15 },
      1.0
    );

    expect(deformed[foreheadIdx].x).toBe(mockLandmarks[foreheadIdx].x);
    expect(deformed[foreheadIdx].y).toBe(mockLandmarks[foreheadIdx].y);
  });
});
