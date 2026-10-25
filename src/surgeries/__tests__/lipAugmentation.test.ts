import { describe, it, expect } from 'vitest';
import { deformLipMesh } from '../lipAugmentation';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { LIP_LANDMARK_INDICES } from '../../mesh/lipControlPoints';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('LipAugmentation Deformation Engine (Phase 4)', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + Math.sin(i * 0.1) * 0.2,
    y: 0.5 + Math.cos(i * 0.1) * 0.2,
    z: 0,
  }));

  mockLandmarks[LIP_LANDMARK_INDICES.leftCorner] = { x: 0.40, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.rightCorner] = { x: 0.60, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.cupidsBowCenter] = { x: 0.50, y: 0.63 };
  mockLandmarks[LIP_LANDMARK_INDICES.lowerCenter] = { x: 0.50, y: 0.68 };

  const baseMesh = buildLipMesh(mockLandmarks);

  it('keeps mouth corners anchored during fullness adjustments', () => {
    const leftCornerIdx = LIP_LANDMARK_INDICES.leftCorner;
    const rightCornerIdx = LIP_LANDMARK_INDICES.rightCorner;

    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { upperFullness: 20, lowerFullness: 20, overallFullness: 20, lipWidth: 0 },
      1.0
    );

    // Mouth corners should NOT move at all on fullness
    expect(deformed[leftCornerIdx].x).toBeCloseTo(mockLandmarks[leftCornerIdx].x, 5);
    expect(deformed[leftCornerIdx].y).toBeCloseTo(mockLandmarks[leftCornerIdx].y, 5);
    expect(deformed[rightCornerIdx].x).toBeCloseTo(mockLandmarks[rightCornerIdx].x, 5);
    expect(deformed[rightCornerIdx].y).toBeCloseTo(mockLandmarks[rightCornerIdx].y, 5);
  });

  it('moves upper lip upward on upper fullness without affecting lower lip or corners', () => {
    const cupidsBowIdx = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const lowerCenterIdx = LIP_LANDMARK_INDICES.lowerCenter;

    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { upperFullness: 20, lowerFullness: 0, overallFullness: 0, lipWidth: 0 },
      1.0
    );

    // Upper lip moves upward (negative dy)
    expect(deformed[cupidsBowIdx].y).toBeLessThan(mockLandmarks[cupidsBowIdx].y);
    // Lower lip center should remain unaffected
    expect(deformed[lowerCenterIdx].y).toBeCloseTo(mockLandmarks[lowerCenterIdx].y, 4);
  });

  it('moves corners outward horizontally on lip width without changing vertical fullness', () => {
    const leftCornerIdx = LIP_LANDMARK_INDICES.leftCorner;
    const rightCornerIdx = LIP_LANDMARK_INDICES.rightCorner;

    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { upperFullness: 0, lowerFullness: 0, overallFullness: 0, lipWidth: 15 },
      1.0
    );

    // Width pushes corners outward
    expect(deformed[leftCornerIdx].x).toBeLessThan(mockLandmarks[leftCornerIdx].x);
    expect(deformed[rightCornerIdx].x).toBeGreaterThan(mockLandmarks[rightCornerIdx].x);
    // Corners stay on horizontal line (no vertical change)
    expect(deformed[leftCornerIdx].y).toBeCloseTo(mockLandmarks[leftCornerIdx].y, 5);
    expect(deformed[rightCornerIdx].y).toBeCloseTo(mockLandmarks[rightCornerIdx].y, 5);
  });

  it('leaves non-lip face vertices completely untouched', () => {
    const foreheadIdx = 10; // landmark 10 is top of forehead
    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { upperFullness: 20, lowerFullness: 20, overallFullness: 20, lipWidth: 15 },
      1.0
    );

    expect(deformed[foreheadIdx].x).toBe(mockLandmarks[foreheadIdx].x);
    expect(deformed[foreheadIdx].y).toBe(mockLandmarks[foreheadIdx].y);
  });
});
