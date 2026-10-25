import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES, getChinLandmarkWeight } from '../mesh/chinControlPoints';

export interface ChinSliderParams {
  verticalLength: number; // -15 to +15 (Shorten / Lengthen)
  projection: number;     // -15 to +15 (Recede / Advance)
  chinWidth: number;      // -15 to +15 (V-Line taper / Square)
}

export const DEFAULT_CHIN_SLIDERS: ChinSliderParams = {
  verticalLength: 0,
  projection: 0,
  chinWidth: 0,
};

// Clinical displacement limits (normalized units)
const MAX_VERTICAL_DISPLACEMENT   = 0.012; // ~3.5mm
const MAX_PROJECTION_DISPLACEMENT = 0.009; // ~2.5mm
const MAX_WIDTH_DISPLACEMENT      = 0.010; // ~3.0mm

/** Quadratic ease to avoid sudden aggressive displacement */
function naturalEase(t: number): number {
  const sign = Math.sign(t);
  const normalized = Math.min(1.0, Math.abs(t));
  return sign * normalized * normalized;
}

// Gaussian spatial containment
const SIGMA_SCALE = 1.3;

function gaussianSpatialWeight(
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  halfWidth: number
): number {
  const dx = (vx - cx) / halfWidth;
  const dy = (vy - cy) / halfWidth;
  const distSq = dx * dx + dy * dy;
  return Math.exp(-distSq / (2 * SIGMA_SCALE * SIGMA_SCALE));
}

/**
 * Computes deformed positions for mesh vertices based on chin surgery parameters.
 * Preserves the mentolabial fold (landmarks 17, 18) and the lower lip vermilion.
 */
export function deformChinMesh(
  inputVertices: Point2D[],
  baseMesh: CompleteMesh,
  sliders: ChinSliderParams,
  headAngleConfidence: number = 1.0
): Point2D[] {
  // If all sliders are 0, return input without modification
  if (
    sliders.verticalLength === 0 &&
    sliders.projection === 0 &&
    sliders.chinWidth === 0
  ) {
    return inputVertices;
  }

  const numVertices = inputVertices.length;
  const deformed: Point2D[] = new Array(numVertices);

  const effectScale = Math.max(0, Math.min(1, headAngleConfidence));

  // Compute normalized factors with quadratic easing
  const verticalFactor   = naturalEase(sliders.verticalLength / 15) * MAX_VERTICAL_DISPLACEMENT * effectScale;
  const projectionFactor = naturalEase(sliders.projection / 15) * MAX_PROJECTION_DISPLACEMENT * effectScale;
  const widthFactor      = naturalEase(sliders.chinWidth / 15) * MAX_WIDTH_DISPLACEMENT * effectScale;

  // Key chin reference points
  const apexPt   = inputVertices[CHIN_LANDMARK_INDICES.apex] || { x: 0.5, y: 0.85 };
  const pogonionPt = inputVertices[199] || { x: 0.5, y: 0.80 };
  const leftTubercle  = inputVertices[172] || inputVertices[148] || { x: 0.4, y: 0.82 };
  const rightTubercle = inputVertices[397] || inputVertices[377] || { x: 0.6, y: 0.82 };
  const mentolabialPt = inputVertices[18] || { x: 0.5, y: 0.72 };

  const chinCenterX = apexPt.x;
  const chinCenterY = pogonionPt.y;
  const chinHalfWidth = Math.max(0.02, Math.abs(rightTubercle.x - leftTubercle.x) / 2);

  // Mentolabial fold Y acts as upper cutoff plane
  const mentolabialThresholdY = mentolabialPt.y;

  for (let i = 0; i < numVertices; i++) {
    const cur = inputVertices[i];
    if (!cur) {
      deformed[i] = cur;
      continue;
    }

    // Identify landmark index
    const vMeta = baseMesh.vertices[i];
    const lmIndex = vMeta ? vMeta.landmarkIndex : i;

    // Check chin weights
    const weight = getChinLandmarkWeight(lmIndex);
    if (weight.isAnchor || (weight.verticalWeight === 0 && weight.widthWeight === 0 && weight.projectionWeight === 0)) {
      deformed[i] = cur;
      continue;
    }

    // Safety check: protect everything at or above the mentolabial groove
    if (cur.y <= mentolabialThresholdY) {
      deformed[i] = cur;
      continue;
    }

    let dx = 0;
    let dy = 0;

    // 1. Vertical Length (Gnathion / Menton)
    if (weight.verticalWeight > 0 && verticalFactor !== 0) {
      const distFromCenterNorm = Math.min(1.0, Math.abs(cur.x - chinCenterX) / chinHalfWidth);
      const centerFalloff = Math.cos(distFromCenterNorm * (Math.PI / 2));
      dy += verticalFactor * weight.verticalWeight * centerFalloff;
    }

    // 2. Chin Width / V-Line
    if (weight.widthWeight > 0 && widthFactor !== 0) {
      const relX = (cur.x - chinCenterX) / chinHalfWidth;
      dx += relX * widthFactor * weight.widthWeight;
    }

    // 3. Projection / Prominence
    if (weight.projectionWeight > 0 && projectionFactor !== 0) {
      // In 2D frontal view, advancement expands soft tissue downward/outward
      dy += projectionFactor * 0.35 * weight.projectionWeight;
    }

    // Modulate with Gaussian containment bubble
    const gaussian = gaussianSpatialWeight(cur.x, cur.y, chinCenterX, chinCenterY, chinHalfWidth);

    deformed[i] = {
      x: cur.x + dx * gaussian,
      y: cur.y + dy * gaussian,
    };
  }

  return deformed;
}
