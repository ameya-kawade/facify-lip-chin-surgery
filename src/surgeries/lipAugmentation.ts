import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { LIP_LANDMARK_INDICES } from '../mesh/lipControlPoints';

export interface LipSliderParams {
  upperFullness: number;       // -20 to +20
  lowerFullness: number;       // -20 to +20
  overallFullness: number;     // -20 to +20
  lipWidth: number;            // -15 to +15
  // ── Advanced clinic-grade controls ────────────────────────────────────────
  cupidsBowDefinition: number; // -10 to +10  (flatten ↔ sharpen bow peaks)
  cornerLift: number;          // -10 to +10  (droop corners ↔ lift / smile arc)
  philtrumProjection: number;  // -10 to +10  (retract ↔ project philtrum column)
}

export const DEFAULT_LIP_SLIDERS: LipSliderParams = {
  upperFullness: 0,
  lowerFullness: 0,
  overallFullness: 0,
  lipWidth: 0,
  cupidsBowDefinition: 0,
  cornerLift: 0,
  philtrumProjection: 0,
};

// ── Landmark sets for band-position classification ────────────────────────────
const INNER_CANONICAL_SET = new Set([
  ...LIP_LANDMARK_INDICES.upperInner,
  ...LIP_LANDMARK_INDICES.lowerInner,
]);

/**
 * Enforces natural anatomical aesthetic limits:
 * - Upper lip: 35-45% of total lip volume
 * - Lower lip: 55-65% of total lip volume
 * - Ratio lower / upper lip between 1.1 and 1.8  (relaxed from 1.2 per fix doc §3 P3)
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
    if (ratio < 1.1) {
      u = l / 1.1;
    } else if (ratio > 1.8) {
      l = u * 1.8;
    }
  }

  return {
    upper: upper < 0 ? upper : u,
    lower: lower < 0 ? lower : l,
  };
}

// ── P1: Softer easing so mid-slider (~+10) gives ~45% response, not 25% ─────
// Was t² (quadratic); now t^1.5. Slider +10/+20 → 0.45/1.0 instead of 0.25/1.0
function naturalEase(t: number): number {
  const sign = Math.sign(t);
  const n = Math.min(1.0, Math.abs(t));
  return sign * Math.pow(n, 1.5);
}

// ── P1: Gaussian sigma raised so corners aren't over-attenuated ──────────────
// Was 1.4 → now 1.8 for the width term, preventing corner motion loss
const SIGMA_SCALE_FULLNESS = 1.8;
const SIGMA_SCALE_WIDTH    = 2.2; // wider kernel so width effect reaches corners

function gaussianSpatialWeight(
  vx: number,
  vy: number,
  lipCx: number,
  lipCy: number,
  lipHalfWidth: number,
  sigma: number
): number {
  const dx = (vx - lipCx) / lipHalfWidth;
  const dy = (vy - lipCy) / lipHalfWidth;
  const distSq = dx * dx + dy * dy;
  return Math.exp(-distSq / (2 * sigma * sigma));
}

/**
 * Computes deformed positions for all mesh vertices based on slider parameters.
 * Only lip sub-mesh vertices carry deformation; surrounding face vertices are unchanged.
 *
 * P0 fixes applied:
 *   1. Weight hierarchy flipped in deformationWeights.ts (outer contour 1.0, inner 0.15)
 *   2. Band-dilation: each vertex's displacement is scaled by bandT (0 inner → 1 outer)
 *      so the outer vermilion contour moves ~6.5× further than the inner boundary
 *
 * P1 fixes applied:
 *   3. MAX_FULLNESS_DISP raised from mouthWidth*0.08 → mouthWidth*0.22
 *   4. MAX_WIDTH_DISP raised from mouthWidth*0.06 → mouthWidth*0.16
 *   5. naturalEase(t) uses t^1.5 instead of t² (mid-slider ~45% vs 25% response)
 *   6. Gaussian sigma widened so corners aren't attenuated on width deformation
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
    sliders.lipWidth === 0 &&
    sliders.cupidsBowDefinition === 0 &&
    sliders.cornerLift === 0 &&
    sliders.philtrumProjection === 0;

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
  const leftCorner  = sourceVertices[LIP_LANDMARK_INDICES.leftCorner]  || { x: 0.4, y: 0.6 };
  const rightCorner = sourceVertices[LIP_LANDMARK_INDICES.rightCorner] || { x: 0.6, y: 0.6 };
  const mouthWidth  = Math.max(0.02, Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y));
  const lipCenterX  = (leftCorner.x + rightCorner.x) / 2;
  const lipCenterY  = (leftCorner.y + rightCorner.y) / 2;
  const lipHalfWidth = mouthWidth / 2;

  // ── P1: Restored + increased magnitude headroom ────────────────────────────
  // Target: outer contour ≥ 10 px at 720p slider +20 (was ~5 px).
  // mouthWidth in normalised coords ≈ 0.20 at 720p → 0.22 * 0.20 * 720 ≈ 32 px ceiling.
  const MAX_FULLNESS_DISP = mouthWidth * 0.22;  // was 0.08 — target outer contour ≥10 px
  const MAX_WIDTH_DISP    = mouthWidth * 0.16;  // was 0.06
  const MAX_BOW_DISP      = mouthWidth * 0.06;  // cupid's bow
  const MAX_CORNER_DISP   = mouthWidth * 0.07;  // corner lift
  const MAX_PHILTRUM_DISP = mouthWidth * 0.06;  // philtrum projection

  // ── P1: Apply naturalEase (t^1.5) instead of raw linear ───────────────────
  const rawUpper    = naturalEase(Math.max(-1, Math.min(1, (sliders.upperFullness + sliders.overallFullness) / 20)));
  const rawLower    = naturalEase(Math.max(-1, Math.min(1, (sliders.lowerFullness + sliders.overallFullness) / 20)));
  const rawWidth    = naturalEase(Math.max(-1, Math.min(1, sliders.lipWidth / 15)));
  const rawBow      = naturalEase(Math.max(-1, Math.min(1, sliders.cupidsBowDefinition / 10)));
  const rawCorner   = naturalEase(Math.max(-1, Math.min(1, sliders.cornerLift / 10)));
  const rawPhiltrum = naturalEase(Math.max(-1, Math.min(1, sliders.philtrumProjection / 10)));

  const scaledUpper    = rawUpper * MAX_FULLNESS_DISP;
  const scaledLower    = rawLower * MAX_FULLNESS_DISP;
  const scaledWidth    = rawWidth * MAX_WIDTH_DISP;
  const scaledBow      = rawBow * MAX_BOW_DISP;
  const scaledCorner   = rawCorner * MAX_CORNER_DISP;
  const scaledPhiltrum = rawPhiltrum * MAX_PHILTRUM_DISP;

  const { upper: finalUpper, lower: finalLower } = enforceNaturalRatio(scaledUpper, scaledLower);

  const upperFullnessFactor = finalUpper * effectScale;
  const lowerFullnessFactor = finalLower * effectScale;
  const widthFactor         = scaledWidth * effectScale;
  const bowFactor           = scaledBow * effectScale;
  const cornerLiftFactor    = scaledCorner * effectScale;
  const philtrumFactor      = scaledPhiltrum * effectScale;

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

    // ── 1. Lip Width ──────────────────────────────────────────────────────
    if (weight.widthWeight > 0 && widthFactor !== 0) {
      const relX = (curX - lipCenterX) / lipHalfWidth;
      // P1: distribute stretch along the full border (sqrt softens corner peak)
      const stretchCurve = Math.sign(relX) * Math.sqrt(Math.abs(relX));
      dx += stretchCurve * widthFactor * weight.widthWeight;
    }

    // ── 2. Fullness with band-dilation (P0 fix) ───────────────────────────
    // bandT: 0 at inner boundary (teeth side) → 1 at outer vermilion contour.
    // Canonical landmark index tells us which side we're on.
    const lmIdx = baseMesh.vertices[i]?.landmarkIndex ?? -1;
    const isInnerBoundary = lmIdx >= 0 && INNER_CANONICAL_SET.has(lmIdx);
    // For synthetic vertices, estimate band position from weightA: outer parent = closer to 1
    const weightA = baseMesh.vertices[i]?.weightA;
    const bandT = isInnerBoundary
      ? 0.1
      : lmIdx >= 0
        ? 1.0  // canonical outer border
        : (weightA !== undefined ? Math.max(0.1, 1.0 - weightA) : 0.6); // synthetic

    if (weight.fullnessWeight > 0) {
      const distFromCenterNorm = Math.min(1, Math.abs(curX - lipCenterX) / lipHalfWidth);
      const centerFalloff = Math.cos(distFromCenterNorm * (Math.PI / 2)); // 1 at center, 0 at corners

      if (weight.isUpperLip && upperFullnessFactor !== 0) {
        // Upper lip moves upward; band-dilation makes outer contour travel most
        dy -= upperFullnessFactor * weight.fullnessWeight * centerFalloff * bandT;
      } else if (weight.isLowerLip && lowerFullnessFactor !== 0) {
        // Lower lip moves downward; same band-dilation
        dy += lowerFullnessFactor * weight.fullnessWeight * centerFalloff * bandT;
      }
    }

    // ── 3. Cupid's Bow Definition (upper lip outer only) ──────────────────
    if (weight.isUpperLip && weight.fullnessWeight > 0 && bowFactor !== 0) {
      const relX = (curX - lipCenterX) / lipHalfWidth;
      const bowShape = Math.sin(Math.abs(relX) * Math.PI); // peaks at ±0.5 normalised x
      dy -= bowFactor * bowShape * weight.fullnessWeight * bandT;
    }

    // ── 4. Corner Lift ────────────────────────────────────────────────────
    if (cornerLiftFactor !== 0 && weight.widthWeight > 0) {
      const relX = (curX - lipCenterX) / lipHalfWidth;
      const cornerWeight = Math.max(0, Math.abs(relX) - 0.5) * 2; // 0 at centre, 1 at corners
      dy -= cornerLiftFactor * cornerWeight * weight.widthWeight;
      dx -= relX * Math.abs(cornerLiftFactor) * 0.3 * cornerWeight * weight.widthWeight;
    }

    // ── 5. Philtrum Projection (upper lip centre column only) ─────────────
    if (weight.isUpperLip && weight.fullnessWeight > 0 && philtrumFactor !== 0) {
      const relX = (curX - lipCenterX) / lipHalfWidth;
      const philtrumMask = Math.exp(-(relX * relX) / (2 * 0.09)); // σ=0.3 tight Gaussian
      dy -= philtrumFactor * philtrumMask * weight.fullnessWeight * bandT;
    }

    // ── Gaussian spatial containment ──────────────────────────────────────
    // Separate sigmas: fullness uses 1.8 (moderate), width uses 2.2 (wider, not eating corners)
    const gaussFull  = gaussianSpatialWeight(curX, curY, lipCenterX, lipCenterY, lipHalfWidth, SIGMA_SCALE_FULLNESS);
    const gaussWidth = gaussianSpatialWeight(curX, curY, lipCenterX, lipCenterY, lipHalfWidth, SIGMA_SCALE_WIDTH);

    deformed[i] = {
      x: curX + dx * gaussWidth,
      y: curY + dy * gaussFull,
    };
  }

  return deformed;
}
