import { describe, it, expect } from 'vitest';
import { deformChinMesh, DEFAULT_CHIN_SLIDERS } from '../chinSurgery';
import { deformLipMesh, DEFAULT_LIP_SLIDERS } from '../lipAugmentation';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../../mesh/chinControlPoints';
import { LIP_LANDMARK_INDICES } from '../../mesh/lipControlPoints';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('ChinSurgery Deformation Engine (Phase 3/4/7 updated)', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  // Setup realistic chin & lower face landmark coordinates
  mockLandmarks[LIP_LANDMARK_INDICES.leftCorner]      = { x: 0.40, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.rightCorner]     = { x: 0.60, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.cupidsBowCenter] = { x: 0.50, y: 0.63 };
  mockLandmarks[LIP_LANDMARK_INDICES.lowerCenter]     = { x: 0.50, y: 0.68 };

  mockLandmarks[18]  = { x: 0.50, y: 0.70 };   // mentolabial fold
  mockLandmarks[199] = { x: 0.50, y: 0.80 };   // pogonion
  mockLandmarks[175] = { x: 0.50, y: 0.82 };   // pogonion lower
  mockLandmarks[152] = { x: 0.50, y: 0.88 };   // gnathion / chin tip apex
  mockLandmarks[148] = { x: 0.42, y: 0.84 };   // left lower border
  mockLandmarks[377] = { x: 0.58, y: 0.84 };   // right lower border
  mockLandmarks[172] = { x: 0.38, y: 0.80 };   // left lateral tubercle
  mockLandmarks[397] = { x: 0.62, y: 0.80 };   // right lateral tubercle
  mockLandmarks[10]  = { x: 0.50, y: 0.15 };   // forehead top

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
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15, projection: 0, chinWidth: 0 },
      1.0
    );
    expect(lengthened[apexIdx].y).toBeGreaterThan(mockLandmarks[apexIdx].y);
    expect(lengthened[apexIdx].x).toBeCloseTo(mockLandmarks[apexIdx].x, 5);

    const shortened = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: -15, projection: 0, chinWidth: 0 },
      1.0
    );
    expect(shortened[apexIdx].y).toBeLessThan(mockLandmarks[apexIdx].y);
  });

  it('strictly preserves the mentolabial fold and lower lip (zero displacement)', () => {
    const mentolabialIdx = 18;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15, projection: 15, chinWidth: 15 },
      1.0
    );

    expect(deformed[mentolabialIdx].x).toBe(mockLandmarks[mentolabialIdx].x);
    expect(deformed[mentolabialIdx].y).toBe(mockLandmarks[mentolabialIdx].y);
  });

  it('tapers chin inwards symmetrically for V-line (negative chinWidth)', () => {
    const leftTubercle  = 172;
    const rightTubercle = 397;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 0, projection: 0, chinWidth: -15 },
      1.0
    );

    expect(deformed[leftTubercle].x).toBeGreaterThan(mockLandmarks[leftTubercle].x);
    expect(deformed[rightTubercle].x).toBeLessThan(mockLandmarks[rightTubercle].x);
  });

  it('chin apex displacement is strictly monotonic with slider strength', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex;

    const d7 = deformChinMesh(mockLandmarks, baseMesh, { ...DEFAULT_CHIN_SLIDERS, verticalLength: 7 }, 1.0)[apexIdx].y;
    const d11 = deformChinMesh(mockLandmarks, baseMesh, { ...DEFAULT_CHIN_SLIDERS, verticalLength: 11 }, 1.0)[apexIdx].y;
    const d15 = deformChinMesh(mockLandmarks, baseMesh, { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15 }, 1.0)[apexIdx].y;

    // Apex moves downward (increasing y) as slider increases
    expect(d7).toBeGreaterThan(mockLandmarks[apexIdx].y);
    expect(d11).toBeGreaterThan(d7);
    expect(d15).toBeGreaterThan(d11);
  });

  it('effectScale=0 disables all chin deformation', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15, projection: 15, chinWidth: 15 },
      0.0
    );

    expect(deformed[apexIdx].y).toBeCloseTo(mockLandmarks[apexIdx].y, 6);
  });

  it('preserves lip deformation when chin surgery applied sequentially', () => {
    const cupidsBow = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const apexIdx   = CHIN_LANDMARK_INDICES.apex;

    const lipDeformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 0, overallFullness: 0, lipWidth: 0 },
      1.0
    );
    expect(lipDeformed[cupidsBow].y).toBeLessThan(mockLandmarks[cupidsBow].y);

    const fullyDeformed = deformChinMesh(
      lipDeformed,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15, projection: 0, chinWidth: 0 },
      1.0
    );

    // Lip displacement is strictly preserved
    expect(fullyDeformed[cupidsBow].y).toBe(lipDeformed[cupidsBow].y);
    // Chin is lengthened
    expect(fullyDeformed[apexIdx].y).toBeGreaterThan(mockLandmarks[apexIdx].y);
  });

  it('leaves non-chin vertices (forehead) completely untouched', () => {
    const foreheadIdx = 10;

    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 15, projection: 15, chinWidth: 15 },
      1.0
    );

    expect(deformed[foreheadIdx].x).toBe(mockLandmarks[foreheadIdx].x);
    expect(deformed[foreheadIdx].y).toBe(mockLandmarks[foreheadIdx].y);
  });

  it('chin apex moves meaningfully at mid-slider (Phase 3 magnitude check)', () => {
    const apexIdx = CHIN_LANDMARK_INDICES.apex;
    // At slider +8 / 720p (normalised height ≈ 0.18), displacement should be > 5px equivalent
    // In normalised coords: chinHeight*0.38 * ease(8/15)^1.5 * smoothstep(1.0) ≈ 0.07*0.40*1 = 0.028
    // At 720p that's ~20px (chinHeight ≈ 0.18 → 130px, 0.38*0.40=0.15 → 20px)
    const deformed = deformChinMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_CHIN_SLIDERS, verticalLength: 8 },
      1.0
    );
    const displacementNorm = deformed[apexIdx].y - mockLandmarks[apexIdx].y;
    // Should be at least 1% of normalised face height (i.e., not sub-pixel)
    expect(displacementNorm).toBeGreaterThan(0.005);
  });
});
