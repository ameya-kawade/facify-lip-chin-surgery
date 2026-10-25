import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from './lipMeshBuilder';

/**
 * Resolves current frame positions for every vertex in the mesh.
 * Guarantees output array length === mesh.vertices.length in exact index order.
 * Returns null if required landmarks are missing, out of bounds, or coordinates are non-finite.
 */
export function resolveMeshPositions(
  smoothedLandmarks: Point2D[],
  mesh: CompleteMesh
): Point2D[] | null {
  if (!smoothedLandmarks || smoothedLandmarks.length === 0 || !mesh || !mesh.vertices) {
    return null;
  }

  const numVertices = mesh.vertices.length;
  const resolved: Point2D[] = new Array(numVertices);

  for (let i = 0; i < numVertices; i++) {
    const v = mesh.vertices[i];
    if (!v) return null;

    let x: number;
    let y: number;

    if (v.landmarkIndex >= 0) {
      if (v.landmarkIndex >= smoothedLandmarks.length) {
        return null;
      }
      const lm = smoothedLandmarks[v.landmarkIndex];
      if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
        return null;
      }
      x = lm.x;
      y = lm.y;
    } else if (v.parentA !== undefined && v.parentB !== undefined) {
      if (
        v.parentA < 0 ||
        v.parentA >= smoothedLandmarks.length ||
        v.parentB < 0 ||
        v.parentB >= smoothedLandmarks.length
      ) {
        return null;
      }
      const pA = smoothedLandmarks[v.parentA];
      const pB = smoothedLandmarks[v.parentB];
      if (
        !pA ||
        !pB ||
        !Number.isFinite(pA.x) ||
        !Number.isFinite(pA.y) ||
        !Number.isFinite(pB.x) ||
        !Number.isFinite(pB.y)
      ) {
        return null;
      }
      const wA = v.weightA ?? 0.5;
      x = pA.x * wA + pB.x * (1 - wA);
      y = pA.y * wA + pB.y * (1 - wA);
    } else {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
        return null;
      }
      x = v.x;
      y = v.y;
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    resolved[i] = { x, y };
  }

  return resolved;
}
