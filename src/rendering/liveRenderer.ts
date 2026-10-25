import { FaceTracker } from '../tracking/faceTracker';
import { LandmarkSmoother, Point2D } from '../tracking/landmarkSmoother';
import { estimatePoseFromMatrix, PoseEstimate } from '../tracking/poseEstimator';
import { JawOpenGate } from '../tracking/jawOpenGate';
import { CompleteMesh, buildLipMesh } from '../mesh/lipMeshBuilder';
import { resolveMeshPositions } from '../mesh/resolveMeshPositions';
import { deformLipMesh, LipSliderParams } from '../surgeries/lipAugmentation';
import { deformChinMesh, ChinSliderParams } from '../surgeries/chinSurgery';
import { renderWarpedFrame, WarperDiagnostic } from '../warping/imageWarper';

export interface RendererStatus {
  fps: number;
  faceDetected: boolean;
  isFrontal: boolean;
  confidence: number;
  pose: PoseEstimate;
  rawJawOpen: number;
  jawGateScale: number;
  effectiveScale: number;
  gateReason?: string;
  activeTriangles: number;
  skippedTriangles: number;
  maxDisplacementPx: number;
}

export interface LiveRendererOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  sliderRef: React.MutableRefObject<LipSliderParams>;
  chinSliderRef?: React.MutableRefObject<ChinSliderParams>;
  isBeforeAfterActiveRef: React.MutableRefObject<boolean>;
  wireframeRef: React.MutableRefObject<boolean>;
  onStatusUpdate?: (status: RendererStatus) => void;
}

export class LiveRenderer {
  private tracker = new FaceTracker();
  private smoother = new LandmarkSmoother(478);
  private jawGate = new JawOpenGate();
  private mesh: CompleteMesh | null = null;
  private isRunning = false;
  private animationFrameId: number | null = null;
  private videoCallbackId: number | null = null;
  private activeVideoElement: HTMLVideoElement | null = null;

  private frameCount = 0;
  private lastFpsTime = performance.now();
  private currentFps = 0;
  private lastStatusDispatch = 0;
  private lastDiagnostic: WarperDiagnostic = {
    activeTriangles: 0,
    renderedTriangles: 0,
    skippedTriangles: 0,
    maxDisplacementPx: 0,
  };

  async start(options: LiveRendererOptions): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.activeVideoElement = options.video;
    await this.tracker.initialize();

    // Guard against stop() called while awaiting initialize()
    if (!this.isRunning) return;

    const {
      video,
      canvas,
      sliderRef,
      chinSliderRef,
      isBeforeAfterActiveRef,
      wireframeRef,
      onStatusUpdate,
    } = options;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      console.error('LiveRenderer: Failed to acquire 2D canvas context');
      this.isRunning = false;
      return;
    }

    const scheduleNextFrame = () => {
      if (!this.isRunning) return;
      if ('requestVideoFrameCallback' in video) {
        this.videoCallbackId = video.requestVideoFrameCallback((now: number) => {
          this.videoCallbackId = null;
          loop(now);
        });
      } else {
        this.animationFrameId = requestAnimationFrame((now: number) => {
          this.animationFrameId = null;
          loop(now);
        });
      }
    };

    const loop = (timestamp: DOMHighResTimeStamp) => {
      if (!this.isRunning) return;

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
      }

      const w = canvas.width;
      const h = canvas.height;

      const tracking = this.tracker.detectForVideo(video, timestamp);
      const faceDetected = tracking.landmarks.length > 0;
      const pose = estimatePoseFromMatrix(tracking.matrix);

      let jawEffectScale = 1.0;
      let effectiveScale = 1.0;
      let gateReason: string | undefined;

      if (!faceDetected || w === 0 || h === 0) {
        if (video.readyState >= 2 && w > 0 && h > 0) {
          ctx.drawImage(video, 0, 0, w, h);
        }
        this.lastDiagnostic = {
          activeTriangles: 0,
          renderedTriangles: 0,
          skippedTriangles: 0,
          maxDisplacementPx: 0,
        };
      } else {
        const smoothedLandmarks: Point2D[] = this.smoother.smooth(tracking.landmarks, timestamp);

        if (!this.mesh) {
          this.mesh = buildLipMesh(smoothedLandmarks);
        }

        // Strict mesh coordinate contract: resolve full source vertices matching mesh.vertices
        const sourceVertices = resolveMeshPositions(smoothedLandmarks, this.mesh);

        if (!sourceVertices) {
          if (video.readyState >= 2 && w > 0 && h > 0) {
            ctx.drawImage(video, 0, 0, w, h);
          }
        } else if (isBeforeAfterActiveRef.current) {
          ctx.drawImage(video, 0, 0, w, h);
          this.lastDiagnostic = {
            activeTriangles: 0,
            renderedTriangles: 0,
            skippedTriangles: 0,
            maxDisplacementPx: 0,
          };
        } else {
          const sliders = sliderRef.current;
          const chinSliders = chinSliderRef?.current;

          const headAngleConfidence = pose.isFrontal ? 1.0 : pose.score;
          jawEffectScale = this.jawGate.update(tracking.jawOpen, timestamp);
          effectiveScale = headAngleConfidence * jawEffectScale;

          if (jawEffectScale < 0.5) {
            gateReason = 'Mouth open (gated)';
          } else if (!pose.isFrontal) {
            gateReason = 'Head turned (low confidence)';
          }

          const isLipZero =
            sliders.upperFullness === 0 &&
            sliders.lowerFullness === 0 &&
            sliders.overallFullness === 0 &&
            sliders.lipWidth === 0 &&
            sliders.cupidsBowDefinition === 0 &&
            sliders.cornerLift === 0 &&
            sliders.philtrumProjection === 0;

          const isChinZero =
            !chinSliders ||
            (chinSliders.verticalLength === 0 &&
              chinSliders.projection === 0 &&
              chinSliders.chinWidth === 0 &&
              chinSliders.jawAngleWidth === 0 &&
              chinSliders.chinAsymmetryTilt === 0 &&
              chinSliders.prejowlCorrection === 0);

          const isIdentity = isLipZero && isChinZero;

          // Step 1: Deform lip submesh from resolved source vertices
          const lipDeformed = deformLipMesh(
            sourceVertices,
            this.mesh,
            sliders,
            effectiveScale
          );

          // Step 2: Deform chin submesh
          const fullyDeformed = chinSliders
            ? deformChinMesh(lipDeformed, this.mesh, chinSliders, effectiveScale)
            : lipDeformed;

          // Render warped frame using full source and destination vertices arrays
          this.lastDiagnostic = renderWarpedFrame(
            ctx,
            video,
            w,
            h,
            sourceVertices,
            fullyDeformed,
            this.mesh,
            {
              renderWireframe: wireframeRef.current,
              // Phase 2: Pass chin triangle indices so debug overlay colours them amber
              // and draws displacement vectors for all active vertices
              chinTriangleIndices: this.mesh.chinTriangleIndices,
              renderDisplacementVectors: wireframeRef.current,
              isIdentity,
            }
          );
        }
      }

      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsTime >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
        this.frameCount = 0;
        this.lastFpsTime = now;
      }

      if (onStatusUpdate && now - this.lastStatusDispatch >= 300) {
        this.lastStatusDispatch = now;
        onStatusUpdate({
          fps: this.currentFps,
          faceDetected,
          isFrontal: pose.isFrontal,
          confidence: tracking.confidence,
          pose,
          rawJawOpen: tracking.jawOpen,
          jawGateScale: jawEffectScale,
          effectiveScale,
          gateReason,
          activeTriangles: this.lastDiagnostic.activeTriangles,
          skippedTriangles: this.lastDiagnostic.skippedTriangles,
          maxDisplacementPx: this.lastDiagnostic.maxDisplacementPx,
        });
      }

      scheduleNextFrame();
    };

    scheduleNextFrame();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.videoCallbackId !== null && this.activeVideoElement && 'cancelVideoFrameCallback' in this.activeVideoElement) {
      this.activeVideoElement.cancelVideoFrameCallback(this.videoCallbackId);
      this.videoCallbackId = null;
    }
    this.smoother.reset();
    this.jawGate.reset();
  }

  resetMesh(): void {
    this.mesh = null;
    this.smoother.reset();
    this.jawGate.reset();
  }
}
