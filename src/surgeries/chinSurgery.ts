import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../mesh/chinControlPoints';

export interface ChinSliderParams {
  verticalLength: number;         // -15 to +15  (Shorten / Lengthen)
  projection: number;             // -15 to +15  (Frontal contour prominence)
  chinWidth: number;              // -15 to +15  (V-Line taper / Square)
  // ── Advanced clinic-grade controls ─────────────────────────────────────
  jawAngleWidth: number;          // -10 to +10  (Narrow gonial angle ↔ Widen)
  chinAsymmetryTilt: number;      // -10 to +10  (Tilt chin apex left ↔ right)
  prejowlCorrection: number;      // -10 to +10  (Fill pre-jowl sulcus depression)
}

export const DEFAULT_CHIN_SLIDERS: ChinSliderParams = {
  verticalLength: 0,
  projection: 0,
  chinWidth: 0,
  jawAngleWidth: 0,
  chinAsymmetryTilt: 0,
  prejowlCorrection: 0,
};

// ── P1: naturalEase mirrors the lip fix — t^1.5 gives ~45% at mid-slider ──────
function naturalEase(t: number): number {
  const sign = Math.sign(t);
  const n = Math.min(1.0, Math.abs(t));
  return sign * Math.pow(n, 1.5);
}

/**
 * Computes deformed positions for mesh vertices based on chin surgery parameters.
 *
 * Fixes applied (per FACIFY_CHIN_VISIBILITY_AND_POSE_TRACKING_PLAN):
 *
 * Phase 3 — Magnitude tuning:
 *   • MAX_VERT_DISP:   chinHeight * 0.18 → 0.38  (~2.1× increase, target ≥ 15px at mid-slider)
 *   • MAX_WIDTH_DISP:  chinHalfWidth * 0.16 → 0.32
 *   • MAX_PROJ_DISP:   chinHeight * 0.10 → 0.22  (was attenuated ×0.4 inside, now exposed fully)
 *   • MAX_JAW_DISP:    jawHalfWidth * 0.15 → 0.28
 *   • MAX_TILT_DISP:   chinHalfWidth * 0.12 → 0.20
 *   • naturalEase(t^1.5) applied to all sliders (was raw linear)
 *   • Projection no longer multiplied by extra 0.4 attenuation factor
 *
 * Phase 4B — Face-local scale:
 *   • All displacements derived from chin geometry (chinHeight, chinHalfWidth),
 *     which itself tracks with the face. This is already inherently face-local.
 *   • Pose confidence (headAngleConfidence) smoothly scales effect; no sharp cutoff.
 *
 * Phase 4D — Stability:
 *   • smoothstep verticalWeight still used (smooth, 0 at fold → 1 at apex)
 *   • chinWidth now uses sqrt(normX) curve so mid-chin body gets more displacement
 *   • Spatial region checks remain strict to protect mentolabial fold and lips
 */
export function deformChinMesh(
  inputVertices: Point2D[],
  baseMesh: CompleteMesh,
  sliders: ChinSliderParams,
  headAngleConfidence: number = 1.0
): Point2D[] {
  const numVertices = baseMesh.vertices.length;

  // Identity fast-path if all sliders are 0
  const isZero =
    sliders.verticalLength === 0 &&
    sliders.projection === 0 &&
    sliders.chinWidth === 0 &&
    sliders.jawAngleWidth === 0 &&
    sliders.chinAsymmetryTilt === 0 &&
    sliders.prejowlCorrection === 0;

  if (isZero) {
    if (inputVertices.length >= numVertices) {
      return inputVertices.slice(0, numVertices);
    }
    const padded = new Array(numVertices);
    for (let i = 0; i < numVertices; i++) {
      padded[i] = inputVertices[i] || baseMesh.vertices[i];
    }
    return padded;
  }

  const deformed: Point2D[] = new Array(numVertices);
  const effectScale = Math.max(0, Math.min(1, headAngleConfidence));

  // ── Key chin reference anchors ────────────────────────────────────────────
  const apexPt        = inputVertices[CHIN_LANDMARK_INDICES.apex] || { x: 0.5, y: 0.88 };
  const leftTubercle  = inputVertices[172] || inputVertices[148] || { x: 0.38, y: 0.82 };
  const rightTubercle = inputVertices[397] || inputVertices[377] || { x: 0.62, y: 0.82 };
  const mentolabialPt = inputVertices[18]  || { x: 0.5, y: 0.70 };

  const leftGonion  = inputVertices[172] || inputVertices[136] || { x: 0.30, y: 0.82 };
  const rightGonion = inputVertices[397] || inputVertices[365] || { x: 0.70, y: 0.82 };

  const chinCenterX   = apexPt.x;
  const chinHalfWidth = Math.max(0.02, Math.abs(rightTubercle.x - leftTubercle.x) / 2);
  const chinHeight    = Math.max(0.02, apexPt.y - mentolabialPt.y);
  const jawHalfWidth  = Math.max(0.02, Math.abs(rightGonion.x - leftGonion.x) / 2);

  // ── Phase 3: Magnitude headroom — all values roughly 2× previous ──────────
  // At 720p: chinHeight ≈ 0.18 normalised → ~130px. 0.38 × 130 ≈ 49px ceiling at +15 full ease.
  // At mid-slider (+7) with t^1.5 ≈ 0.44 ease × verticalWeight ~0.5 → ~10-15px. Visible.
  const MAX_VERT_DISP  = chinHeight * 0.38;       // was 0.18
  const MAX_WIDTH_DISP = chinHalfWidth * 0.32;    // was 0.16
  const MAX_PROJ_DISP  = chinHeight * 0.22;       // was 0.10; no longer ×0.4 inside
  const MAX_JAW_DISP   = jawHalfWidth * 0.28;     // was 0.15
  const MAX_TILT_DISP  = chinHalfWidth * 0.20;    // was 0.12
  const MAX_JOWL_DISP  = chinHeight * 0.14;       // was 0.08

  // ── Phase 3: Apply naturalEase (t^1.5) — was raw linear ──────────────────
  const rawVertical   = naturalEase(Math.max(-1, Math.min(1, sliders.verticalLength / 15)));
  const rawWidth      = naturalEase(Math.max(-1, Math.min(1, sliders.chinWidth / 15)));
  const rawProjection = naturalEase(Math.max(-1, Math.min(1, sliders.projection / 15)));
  const rawJawAngle   = naturalEase(Math.max(-1, Math.min(1, sliders.jawAngleWidth / 10)));
  const rawTilt       = naturalEase(Math.max(-1, Math.min(1, sliders.chinAsymmetryTilt / 10)));
  const rawJowl       = naturalEase(Math.max(-1, Math.min(1, sliders.prejowlCorrection / 10)));

  const vertFactor  = rawVertical * MAX_VERT_DISP * effectScale;
  const widthFactor = rawWidth * MAX_WIDTH_DISP * effectScale;
  const projFactor  = rawProjection * MAX_PROJ_DISP * effectScale;
  const jawFactor   = rawJawAngle * MAX_JAW_DISP * effectScale;
  const tiltFactor  = rawTilt * MAX_TILT_DISP * effectScale;
  const jowlFactor  = rawJowl * MAX_JOWL_DISP * effectScale;

  // Spatial cutoffs
  const mentolabialThresholdY = mentolabialPt.y;
  const chinBottomCutoffY     = apexPt.y + chinHeight * 0.6;
  const chinMaxRadiusX        = chinHalfWidth * 1.5;
  const gonialUpperY          = mentolabialPt.y;
  const gonialLowerY          = apexPt.y;
  const gonialZoneRadiusX     = jawHalfWidth * 1.3;
  const jowlInnerX            = chinHalfWidth * 0.9;
  const jowlOuterX            = chinHalfWidth * 1.8;

  for (let i = 0; i < numVertices; i++) {
    const cur = inputVertices[i];
    if (!cur) {
      deformed[i] = { x: 0.5, y: 0.5 };
      continue;
    }

    const curX = cur.x;
    const curY = cur.y;

    // Strictly preserve everything at or above the mentolabial groove
    if (curY <= mentolabialThresholdY) {
      deformed[i] = { x: curX, y: curY };
      continue;
    }

    let dx = 0;
    let dy = 0;

    const distFromCenterX = Math.abs(curX - chinCenterX);
    const normY = Math.min(1.0, Math.max(0.0, (curY - mentolabialThresholdY) / chinHeight));
    const normX = Math.min(1.0, distFromCenterX / chinHalfWidth);

    // Smoothstep: 0 at fold → 1 at apex
    const verticalWeight    = normY * normY * (3 - 2 * normY);
    const horizontalFalloff = Math.cos(normX * (Math.PI / 2));

    // ── 1. Vertical Length ─────────────────────────────────────────────────
    if (vertFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      dy += vertFactor * verticalWeight * horizontalFalloff;
    }

    // ── 2. Chin Width / V-Line ─────────────────────────────────────────────
    // Phase 3: sqrt(normX) curve distributes displacement across mid-chin body,
    // not just the outer edges. At normX=0.5 → sqrt gives 0.71 vs normX gives 0.5.
    if (widthFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      const relX = (curX - chinCenterX) / chinHalfWidth;
      const widthCurve = Math.sign(relX) * Math.sqrt(Math.abs(relX));
      dx += widthCurve * widthFactor * verticalWeight;
    }

    // ── 3. Frontal Contour Prominence ─────────────────────────────────────
    // Phase 3: removed the extra ×0.4 attenuation factor; MAX_PROJ_DISP already tuned
    if (projFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      dy += projFactor * verticalWeight * horizontalFalloff;
    }

    // ── 4. Jaw Angle Width ────────────────────────────────────────────────
    if (jawFactor !== 0 && distFromCenterX >= chinHalfWidth * 0.8 && distFromCenterX <= gonialZoneRadiusX
        && curY >= gonialUpperY && curY <= gonialLowerY) {
      const jawNormX = (distFromCenterX - chinHalfWidth * 0.8) / (gonialZoneRadiusX - chinHalfWidth * 0.8);
      const jawNormY = (curY - gonialUpperY) / (gonialLowerY - gonialUpperY);
      const jawWeight = Math.sin(jawNormX * Math.PI) * Math.sin(jawNormY * Math.PI);
      const signX = curX >= chinCenterX ? 1 : -1;
      dx += signX * jawFactor * jawWeight;
    }

    // ── 5. Chin Asymmetry / Tilt ──────────────────────────────────────────
    if (tiltFactor !== 0 && distFromCenterX <= chinHalfWidth * 1.2 && curY <= chinBottomCutoffY) {
      const apexWeight    = normY * normY;
      const lateralFalloff = Math.max(0, 1.0 - normX);
      dx += tiltFactor * apexWeight * lateralFalloff;
    }

    // ── 6. Pre-Jowl Sulcus Correction ────────────────────────────────────
    if (jowlFactor !== 0) {
      const jowlInZone = distFromCenterX >= jowlInnerX && distFromCenterX <= jowlOuterX
        && curY >= mentolabialThresholdY && curY <= gonialLowerY;
      if (jowlInZone) {
        const jowlNormX = (distFromCenterX - jowlInnerX) / (jowlOuterX - jowlInnerX);
        const jowlNormY = (curY - mentolabialThresholdY) / (gonialLowerY - mentolabialThresholdY);
        const jowlWeight = Math.sin(jowlNormX * Math.PI) * Math.sin(jowlNormY * Math.PI);
        const signX = curX >= chinCenterX ? 1 : -1;
        dx += signX * jowlFactor * jowlWeight * 0.5;
        dy += jowlFactor * jowlWeight;
      }
    }

    deformed[i] = {
      x: curX + dx,
      y: curY + dy,
    };
  }

  return deformed;
}
