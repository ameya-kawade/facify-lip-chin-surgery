import { describe, it, expect } from 'vitest';
import { deformChinMesh, DEFAULT_CHIN_SLIDERS } from '../chinSurgery';
import { deformLipMesh } from '../lipAugmentation';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../../mesh/chinControlPoints';
import { LIP_LANDMARK_INDICES } from '../../mesh/lipControlPoints';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('ChinSurgery Deformation Engine (Phase 4 & 7)', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  // Setup realistic chin & lower face landmark coordinates
  mockLandmarks[LIP_LANDMARK_INDICES.leftCorner] = { x: 0.40, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.rightCorner] = { x: 0.60, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.cupidsBowCenter] = { x: 0.50, y: 0.63 };
  mockLandmarks[LIP_LANDMARK_INDICES.lowerCenter] = { x: 0.50, y: 0.68 };

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

  it('returns identity when all chin sliders are zero', () => {
    const deformed = deformChinMesh(mockLandmarks, baseMesh, DEFAULT_CHIN_SLIDERS, 1.0);
    expect(deformed).toHaveLength(baseMesh.vertices.length);
    for (let i = 0; i < mockLandmarks.length; i++) {
      expect(deformed[i].x).toBe(mockLandmarks[i].x);
      expect(deformed[i].y).toBe(mockLandmarks[i].y);
    }
  });

  it('lengthens chin vertically on positive verticalLength and shortens on negative', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex;

    const lengthened = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: 15, projection: 0, chinWidth: 0 },
      1.0
    );
    expect(lengthened[apexIdx].y).toBeGreaterThan(mockLandmarks[apexIdx].y);
    expect(lengthened[apexIdx].x).toBeCloseTo(mockLandmarks[apexIdx].x, 5);

    const shortened = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { verticalLength: -15, projection: 0, chinWidth: 0 },
      1.0
    );
    expect(shortened[apexIdx].y).toBeLessThan(mockLandmarks[apexIdx].y);
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

    expect(deformed[leftTubercle].x).toBeGreaterThan(mockLandmarks[leftTubercle].x);
    expect(deformed[rightTubercle].x).toBeLessThan(mockLandmarks[rightTubercle].x);
  });

  it('preserves lip deformation when chin surgery is applied sequentially after lip augmentation', () => {
    const cupidsBow = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const apexIdx = CHIN_LANDMARK_INDICES.apex;

    // 1. Deform lips
    const lipDeformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { upperFullness: 20, lowerFullness: 0, overallFullness: 0, lipWidth: 0 },
      1.0
    );
    expect(lipDeformed[cupidsBow].y).toBeLessThan(mockLandmarks[cupidsBow].y);

    // 2. Deform chin sequentially
    const fullyDeformed = deformChinMesh(
      lipDeformed,
      baseMesh,
      { verticalLength: 15, projection: 0, chinWidth: 0 },
      1.0
    );

    // Lip displacement is strictly preserved!
    expect(fullyDeformed[cupidsBow].y).toBe(lipDeformed[cupidsBow].y);
    // Chin is lengthened!
    expect(fullyDeformed[apexIdx].y).toBeGreaterThan(mockLandmarks[apexIdx].y);
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
