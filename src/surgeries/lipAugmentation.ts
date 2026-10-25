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
      u = l / 1.2;
    } else if (ratio > 1.8) {
      l = u * 1.8;
    }
  }

  return {
    upper: upper < 0 ? upper : u,
    lower: lower < 0 ? lower : l,
  };
}

// Gaussian spatial containment bubble
const SIGMA_SCALE = 1.8; // Expanded to avoid attenuating target vermilion vertices

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
 *
 * @param sourceVertices Fully resolved mesh vertices (same length as baseMesh.vertices)
 * @param baseMesh The CompleteMesh containing topology and weights
 * @param sliders Slider parameter values
 * @param headAngleConfidence Pose and jaw gating factor [0..1]
 */
export function deformLipMesh(
  sourceVertices: Point2D[],
  baseMesh: CompleteMesh,
  sliders: LipSliderParams,
  headAngleConfidence: number = 1.0
): Point2D[] {
  const numVertices = baseMesh.vertices.length;

  // Identity fast-path if all sliders are 0
  const isZero =
    sliders.upperFullness === 0 &&
    sliders.lowerFullness === 0 &&
    sliders.overallFullness === 0 &&
    sliders.lipWidth === 0;

  if (isZero) {
    if (sourceVertices.length >= numVertices) {
      return sourceVertices.slice(0, numVertices);
    }
    const padded = new Array(numVertices);
    for (let i = 0; i < numVertices; i++) {
      padded[i] = sourceVertices[i] || baseMesh.vertices[i];
    }
    return padded;
  }

  const deformed: Point2D[] = new Array(numVertices);
  const effectScale = Math.max(0, Math.min(1, headAngleConfidence));

  // Key reference points for scale and orientation
  const leftCorner = sourceVertices[LIP_LANDMARK_INDICES.leftCorner] || { x: 0.4, y: 0.6 };
  const rightCorner = sourceVertices[LIP_LANDMARK_INDICES.rightCorner] || { x: 0.6, y: 0.6 };
  const mouthWidth = Math.max(0.02, Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y));
  const lipCenterX = (leftCorner.x + rightCorner.x) / 2;
  const lipCenterY = (leftCorner.y + rightCorner.y) / 2;
  const lipHalfWidth = mouthWidth / 2;

  // Calibrate displacement against face scale (mouth width)
  // Ensures visible, calibrated movement whether close to or far from camera
  const MAX_FULLNESS_DISP = mouthWidth * 0.08; // ~8% of mouth width
  const MAX_WIDTH_DISP    = mouthWidth * 0.06; // ~6% of mouth width

  // Step 1: Linear, clamped normalized input in [-1, 1]
  const rawUpper = Math.max(-1, Math.min(1, (sliders.upperFullness + sliders.overallFullness) / 20));
  const rawLower = Math.max(-1, Math.min(1, (sliders.lowerFullness + sliders.overallFullness) / 20));
  const rawWidth = Math.max(-1, Math.min(1, sliders.lipWidth / 15));

  // Step 2: Scale to anatomical bounds
  const scaledUpper = rawUpper * MAX_FULLNESS_DISP;
  const scaledLower = rawLower * MAX_FULLNESS_DISP;
  const scaledWidth = rawWidth * MAX_WIDTH_DISP;

  // Step 3: Anatomical ratio enforcement for positive fullness
  const { upper: finalUpper, lower: finalLower } = enforceNaturalRatio(scaledUpper, scaledLower);

  // Step 4: Modulate by effect scale (head pose + jaw open)
  const upperFullnessFactor = finalUpper * effectScale;
  const lowerFullnessFactor = finalLower * effectScale;
  const widthFactor         = scaledWidth * effectScale;

  for (let i = 0; i < numVertices; i++) {
    const cur = sourceVertices[i];
    if (!cur) {
      deformed[i] = { x: 0.5, y: 0.5 };
      continue;
    }

    const curX = cur.x;
    const curY = cur.y;

    const weight = baseMesh.weights[i];
    if (
      !weight ||
      weight.region === 'OUTSIDE' ||
      (weight.fullnessWeight === 0 && weight.widthWeight === 0)
    ) {
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

    // 2. Fullness Deformation (Upper and Lower)
    // Mouth corners are anchors: weight.fullnessWeight is 0 for corners!
    if (weight.fullnessWeight > 0) {
      const distFromCenterNorm = Math.min(1, Math.abs(curX - lipCenterX) / lipHalfWidth);
      const centerFalloff = Math.cos(distFromCenterNorm * (Math.PI / 2)); // 1 at center, 0 at corners

      if (weight.isUpperLip && upperFullnessFactor !== 0) {
        // Upper lip moves upward (negative Y in screen coords)
        dy -= upperFullnessFactor * weight.fullnessWeight * centerFalloff;
      } else if (weight.isLowerLip && lowerFullnessFactor !== 0) {
        // Lower lip moves downward (positive Y in screen coords)
        dy += lowerFullnessFactor * weight.fullnessWeight * centerFalloff;
      }
    }

    // Gaussian containment: fades smoothly into perioral skin without cutting target vermilion
    const gaussianScale = gaussianSpatialWeight(curX, curY, lipCenterX, lipCenterY, lipHalfWidth);

    deformed[i] = {
      x: curX + dx * gaussianScale,
      y: curY + dy * gaussianScale,
    };
  }

  return deformed;
}
