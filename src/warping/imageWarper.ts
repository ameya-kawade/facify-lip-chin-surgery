import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { warpTriangle, TrianglePoints } from './triangleWarp';

export interface ImageWarperOptions {
  renderWireframe?: boolean;
  wireframeColor?: string;
  triangleIndices?: number[];
  isIdentity?: boolean;
}

export interface WarperDiagnostic {
  activeTriangles: number;
  renderedTriangles: number;
  skippedTriangles: number;
  maxDisplacementPx: number;
}

let cachedOffscreen: OffscreenCanvas | null = null;
let cachedCompositingCanvas: OffscreenCanvas | null = null;

function getCanvases(width: number, height: number): {
  offscreen: OffscreenCanvas;
  offscreenCtx: OffscreenCanvasRenderingContext2D;
  compositingCanvas: OffscreenCanvas;
  compositingCtx: OffscreenCanvasRenderingContext2D;
} {
  if (!cachedOffscreen || cachedOffscreen.width !== width || cachedOffscreen.height !== height) {
    cachedOffscreen = new OffscreenCanvas(width, height);
    cachedCompositingCanvas = new OffscreenCanvas(width, height);
  }
  const offscreenCtx = cachedOffscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const compositingCtx = cachedCompositingCanvas!.getContext('2d') as OffscreenCanvasRenderingContext2D;
  return {
    offscreen: cachedOffscreen,
    offscreenCtx,
    compositingCanvas: cachedCompositingCanvas!,
    compositingCtx,
  };
}

/**
 * Orchestrates full frame rendering:
 * 1. Fast-path identity: when all sliders are 0 and wireframe is off, blits camera frame directly
 * 2. Warps active sub-mesh triangles (lips, chin, or both) with edge expansion
 * 3. Tracks diagnostic counts (rendered vs skipped degenerate triangles, max displacement)
 * 4. Optionally renders debug wireframe
 */
export function renderWarpedFrame(
  ctx: CanvasRenderingContext2D,
  sourceImage: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  sourceVertices: Point2D[],
  deformedVertices: Point2D[],
  mesh: CompleteMesh,
  options: ImageWarperOptions = {}
): WarperDiagnostic {
  // Identity fast path: avoids unnecessary canvas clipping/matrix math when no sliders are moved
  if (options.isIdentity && !options.renderWireframe) {
    ctx.drawImage(sourceImage, 0, 0, canvasWidth, canvasHeight);
    return {
      activeTriangles: 0,
      renderedTriangles: 0,
      skippedTriangles: 0,
      maxDisplacementPx: 0,
    };
  }

  const activeTriangles =
    options.triangleIndices ??
    mesh.allActiveTriangleIndices ??
    mesh.lipTriangleIndices;

  let renderedCount = 0;
  let skippedCount = 0;
  let maxDispSq = 0;

  // Use OffscreenCanvas if available for clean double-buffering
  if (typeof OffscreenCanvas !== 'undefined') {
    const { offscreen, offscreenCtx, compositingCanvas, compositingCtx } = getCanvases(canvasWidth, canvasHeight);

    // Snapshot base camera frame
    offscreenCtx.drawImage(sourceImage, 0, 0, canvasWidth, canvasHeight);

    // Prepare compositing canvas with base frame
    compositingCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    compositingCtx.drawImage(offscreen, 0, 0);

    for (let i = 0; i < activeTriangles.length; i++) {
      const triIdx = activeTriangles[i];
      if (triIdx < 0 || triIdx >= mesh.triangles.length) {
        skippedCount++;
        continue;
      }
      const [idx0, idx1, idx2] = mesh.triangles[triIdx];

      const s0 = sourceVertices[idx0];
      const s1 = sourceVertices[idx1];
      const s2 = sourceVertices[idx2];

      const d0 = deformedVertices[idx0];
      const d1 = deformedVertices[idx1];
      const d2 = deformedVertices[idx2];

      if (
        !s0 || !s1 || !s2 || !d0 || !d1 || !d2 ||
        !Number.isFinite(s0.x) || !Number.isFinite(s0.y) ||
        !Number.isFinite(s1.x) || !Number.isFinite(s1.y) ||
        !Number.isFinite(s2.x) || !Number.isFinite(s2.y) ||
        !Number.isFinite(d0.x) || !Number.isFinite(d0.y) ||
        !Number.isFinite(d1.x) || !Number.isFinite(d1.y) ||
        !Number.isFinite(d2.x) || !Number.isFinite(d2.y)
      ) {
        skippedCount++;
        continue;
      }

      // Track max displacement in pixel space
      const px0 = (d0.x - s0.x) * canvasWidth;
      const py0 = (d0.y - s0.y) * canvasHeight;
      const disp0 = px0 * px0 + py0 * py0;
      if (disp0 > maxDispSq) maxDispSq = disp0;

      const srcTri: TrianglePoints = {
        p0: { x: s0.x * canvasWidth, y: s0.y * canvasHeight },
        p1: { x: s1.x * canvasWidth, y: s1.y * canvasHeight },
        p2: { x: s2.x * canvasWidth, y: s2.y * canvasHeight },
      };

      const dstTri: TrianglePoints = {
        p0: { x: d0.x * canvasWidth, y: d0.y * canvasHeight },
        p1: { x: d1.x * canvasWidth, y: d1.y * canvasHeight },
        p2: { x: d2.x * canvasWidth, y: d2.y * canvasHeight },
      };

      const success = warpTriangle(compositingCtx, offscreen, srcTri, dstTri);
      if (success) {
        renderedCount++;
      } else {
        skippedCount++;
      }
    }

    // Single blit to final canvas
    ctx.drawImage(compositingCanvas, 0, 0);
  } else {
    // Fallback: draw base directly on ctx then warp onto ctx
    ctx.drawImage(sourceImage, 0, 0, canvasWidth, canvasHeight);
    for (let i = 0; i < activeTriangles.length; i++) {
      const triIdx = activeTriangles[i];
      if (triIdx < 0 || triIdx >= mesh.triangles.length) {
        skippedCount++;
        continue;
      }
      const [idx0, idx1, idx2] = mesh.triangles[triIdx];
      const s0 = sourceVertices[idx0];
      const s1 = sourceVertices[idx1];
      const s2 = sourceVertices[idx2];
      const d0 = deformedVertices[idx0];
      const d1 = deformedVertices[idx1];
      const d2 = deformedVertices[idx2];

      if (
        !s0 || !s1 || !s2 || !d0 || !d1 || !d2 ||
        !Number.isFinite(s0.x) || !Number.isFinite(s0.y) ||
        !Number.isFinite(s1.x) || !Number.isFinite(s1.y) ||
        !Number.isFinite(s2.x) || !Number.isFinite(s2.y) ||
        !Number.isFinite(d0.x) || !Number.isFinite(d0.y) ||
        !Number.isFinite(d1.x) || !Number.isFinite(d1.y) ||
        !Number.isFinite(d2.x) || !Number.isFinite(d2.y)
      ) {
        skippedCount++;
        continue;
      }

      const srcTri: TrianglePoints = {
        p0: { x: s0.x * canvasWidth, y: s0.y * canvasHeight },
        p1: { x: s1.x * canvasWidth, y: s1.y * canvasHeight },
        p2: { x: s2.x * canvasWidth, y: s2.y * canvasHeight },
      };
      const dstTri: TrianglePoints = {
        p0: { x: d0.x * canvasWidth, y: d0.y * canvasHeight },
        p1: { x: d1.x * canvasWidth, y: d1.y * canvasHeight },
        p2: { x: d2.x * canvasWidth, y: d2.y * canvasHeight },
      };
      const success = warpTriangle(ctx, sourceImage, srcTri, dstTri);
      if (success) {
        renderedCount++;
      } else {
        skippedCount++;
      }
    }
  }

  // Debug wireframe rendering
  if (options.renderWireframe) {
    ctx.save();
    ctx.strokeStyle = options.wireframeColor || 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1;

    for (let i = 0; i < activeTriangles.length; i++) {
      const triIdx = activeTriangles[i];
      if (triIdx < 0 || triIdx >= mesh.triangles.length) continue;
      const [idx0, idx1, idx2] = mesh.triangles[triIdx];
      const d0 = deformedVertices[idx0];
      const d1 = deformedVertices[idx1];
      const d2 = deformedVertices[idx2];
      if (!d0 || !d1 || !d2) continue;

      ctx.beginPath();
      ctx.moveTo(d0.x * canvasWidth, d0.y * canvasHeight);
      ctx.lineTo(d1.x * canvasWidth, d1.y * canvasHeight);
      ctx.lineTo(d2.x * canvasWidth, d2.y * canvasHeight);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    activeTriangles: activeTriangles.length,
    renderedTriangles: renderedCount,
    skippedTriangles: skippedCount,
    maxDisplacementPx: Math.sqrt(maxDispSq),
  };
}
