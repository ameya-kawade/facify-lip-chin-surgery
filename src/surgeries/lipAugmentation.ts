import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { LIP_LANDMARK_INDICES } from '../mesh/lipControlPoints';

export interface LipSliderParams {
  upperFullness: number;   // -20 to +20
  lowerFullness: number;   // -20 to +20
  overallFullness: number; // -20 to +20
  lipWidth: number;        // -15 to +15
}

export const DEFAULT_LIP_SLIDERS: LipSliderParams = {
  upperFullness: 0,
  lowerFullness: 0,
  overallFullness: 0,
  lipWidth: 0,
};

// --- F5: Clinically Safe Natural Caps & Ratio Clamping ---
const MAX_FULLNESS_DISPLACEMENT = 0.010; // ~2.5mm normalized (was 0.018 ~ 5mm)
const MAX_WIDTH_DISPLACEMENT    = 0.008; // ~2.0mm normalized (was 0.015 ~ 4mm)

/** Quadratic ease to avoid sudden aggressive displacement at small slider moves */
function naturalEase(t: number): number {
  const sign = Math.sign(t);
  const normalized = Math.min(1.0, Math.abs(t));
  return sign * normalized * normalized;
}

/**
 * Enforces natural anatomical aesthetic limits:
 * - Upper lip: 35-45% of total lip volume
 * - Lower lip: 55-65% of total lip volume
 * - Ratio lower / upper lip between 1.2 and 1.8
 */
function enforceNaturalRatio(
  upper: number,
  lower: number
): { upper: number; lower: number } {
  if (upper <= 0 && lower <= 0) return { upper, lower };

  let u = Math.max(0, upper);
  let l = Math.max(0, lower);

  if (u > 0 && l > 0) {
    const ratio = l / u;
    if (ratio < 1.2) {
      // Lower lip too small relative to upper — scale upper down to preserve 1:1.2 min ratio
      u = l / 1.2;
    } else if (ratio > 1.8) {
      // Lower lip too large relative to upper — scale lower down
      l = u * 1.8;
    }
  }

  return {
    upper: upper < 0 ? upper : u,
    lower: lower < 0 ? lower : l,
  };
}

// --- F6: Gaussian Spatial Containment Bubble ---
const SIGMA_SCALE = 1.4; // 1.4 * lipHalfWidth standard deviation

function gaussianSpatialWeight(
  vx: number,
  vy: number,
  lipCx: number,
  lipCy: number,
  lipHalfWidth: number
): number {
  const dx = (vx - lipCx) / lipHalfWidth;
  const dy = (vy - lipCy) / lipHalfWidth;
  const distSq = dx * dx + dy * dy;
  return Math.exp(-distSq / (2 * SIGMA_SCALE * SIGMA_SCALE));
}

/**
 * Computes deformed positions for all mesh vertices based on slider parameters.
 * Only lip sub-mesh vertices carry deformation; surrounding face vertices are unchanged.
 */
export function deformLipMesh(
  currentSmoothedLandmarks: Point2D[],
  baseMesh: CompleteMesh,
  sliders: LipSliderParams,
  headAngleConfidence: number = 1.0
): Point2D[] {
  const numVertices = baseMesh.vertices.length;
  const deformed: Point2D[] = new Array(numVertices);

  // Overall effect scaling (confidence * jawOpenGate)
  const effectScale = Math.max(0, Math.min(1, headAngleConfidence));

  // Step 1: Raw ratios from sliders (-1 to +1)
  const rawUpper = (sliders.upperFullness + sliders.overallFullness) / 20;
  const rawLower = (sliders.lowerFullness + sliders.overallFullness) / 20;
  const rawWidth = sliders.lipWidth / 15;

  // Step 2: Quadratic ease
  const easedUpper = naturalEase(rawUpper);
  const easedLower = naturalEase(rawLower);
  const easedWidth = naturalEase(rawWidth);

  // Step 3: Scale to clinical displacement max
  const scaledUpper = easedUpper * MAX_FULLNESS_DISPLACEMENT;
  const scaledLower = easedLower * MAX_FULLNESS_DISPLACEMENT;
  const scaledWidth = easedWidth * MAX_WIDTH_DISPLACEMENT;

  // Step 4: Anatomical ratio enforcement
  const { upper: finalUpper, lower: finalLower } = enforceNaturalRatio(scaledUpper, scaledLower);

  // Step 5: Modulate by effect scale (head pose + jaw open)
  const upperFullnessFactor = finalUpper * effectScale;
  const lowerFullnessFactor = finalLower * effectScale;
  const widthFactor         = scaledWidth * effectScale;

  // Mouth center, width, and containment bubble metrics
  const leftCorner = currentSmoothedLandmarks[LIP_LANDMARK_INDICES.leftCorner] || { x: 0.4, y: 0.6 };
  const rightCorner = currentSmoothedLandmarks[LIP_LANDMARK_INDICES.rightCorner] || { x: 0.6, y: 0.6 };
  const mouthWidth = Math.max(0.01, rightCorner.x - leftCorner.x);
  const lipCenterX = (leftCorner.x + rightCorner.x) / 2;
  const lipCenterY = (leftCorner.y + rightCorner.y) / 2;
  const lipHalfWidth = mouthWidth / 2;

  for (let i = 0; i < numVertices; i++) {
    const v = baseMesh.vertices[i];
    let curX: number;
    let curY: number;

    if (v.landmarkIndex >= 0 && v.landmarkIndex < currentSmoothedLandmarks.length) {
      const p = currentSmoothedLandmarks[v.landmarkIndex];
      curX = p.x;
      curY = p.y;
    } else if (v.parentA !== undefined && v.parentB !== undefined) {
      const pA = currentSmoothedLandmarks[v.parentA] || baseMesh.vertices[v.parentA];
      const pB = currentSmoothedLandmarks[v.parentB] || baseMesh.vertices[v.parentB];
      const wA = v.weightA ?? 0.5;
      curX = pA.x * wA + pB.x * (1 - wA);
      curY = pA.y * wA + pB.y * (1 - wA);
    } else {
      curX = v.x;
      curY = v.y;
    }

    const weight = baseMesh.weights[i];
    if (!weight || weight.region === 'OUTSIDE' || (weight.fullnessWeight === 0 && weight.widthWeight === 0)) {
      deformed[i] = { x: curX, y: curY };
      continue;
    }

    let dx = 0;
    let dy = 0;

    // 1. Lip Width Deformation
    if (weight.widthWeight > 0 && widthFactor !== 0) {
      const relX = (curX - lipCenterX) / lipHalfWidth;
      dx += relX * widthFactor * weight.widthWeight;
    }

    // 2. Fullness Deformation
    if (weight.fullnessWeight > 0) {
      const distFromCenterNorm = Math.min(1, Math.abs(curX - lipCenterX) / lipHalfWidth);
      const centerFalloff = Math.cos(distFromCenterNorm * (Math.PI / 2));

      if (weight.isUpperLip && upperFullnessFactor !== 0) {
        dy -= upperFullnessFactor * weight.fullnessWeight * centerFalloff;
      } else if (weight.isLowerLip && lowerFullnessFactor !== 0) {
        dy += lowerFullnessFactor * weight.fullnessWeight * centerFalloff;
      }
    }

    // Gaussian containment: guarantees deformation fades to zero outside target lip area
    const gaussianScale = gaussianSpatialWeight(curX, curY, lipCenterX, lipCenterY, lipHalfWidth);

    deformed[i] = {
      x: curX + dx * gaussianScale,
      y: curY + dy * gaussianScale,
    };
  }

  return deformed;
}
