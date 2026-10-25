import { FaceTracker } from '../tracking/faceTracker';
import { LandmarkSmoother, Point2D } from '../tracking/landmarkSmoother';
import { estimatePoseFromMatrix, PoseEstimate } from '../tracking/poseEstimator';
import { JawOpenGate } from '../tracking/jawOpenGate';
import { CompleteMesh, buildLipMesh } from '../mesh/lipMeshBuilder';
import { deformLipMesh, LipSliderParams } from '../surgeries/lipAugmentation';
import { deformChinMesh, ChinSliderParams } from '../surgeries/chinSurgery';
import { renderWarpedFrame } from '../warping/imageWarper';

export interface RendererStatus {
  fps: number;
  faceDetected: boolean;
  isFrontal: boolean;
  confidence: number;
  pose: PoseEstimate;
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

  async start(options: LiveRendererOptions): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    await this.tracker.initialize();

    const {
      video,
      canvas,
      sliderRef,
      chinSliderRef,
      isBeforeAfterActiveRef,
      wireframeRef,
      onStatusUpdate,
    } = options;
    this.activeVideoElement = video;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      console.error('LiveRenderer: Failed to acquire 2D canvas context');
      return;
    }

    const scheduleNextFrame = () => {
      if (!this.isRunning) return;
      if ('requestVideoFrameCallback' in video) {
        this.videoCallbackId = (video as any).requestVideoFrameCallback(
          (_now: number, meta: { mediaTime: number }) => {
            loop(meta.mediaTime * 1000);
          }
        );
      } else {
        this.animationFrameId = requestAnimationFrame(loop);
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

      if (!faceDetected || w === 0 || h === 0) {
        if (video.readyState >= 2 && w > 0 && h > 0) {
          ctx.drawImage(video, 0, 0, w, h);
        }
      } else {
        const smoothedLandmarks: Point2D[] = this.smoother.smooth(tracking.landmarks, timestamp);

        if (!this.mesh) {
          this.mesh = buildLipMesh(smoothedLandmarks);
        }

        if (isBeforeAfterActiveRef.current) {
          ctx.drawImage(video, 0, 0, w, h);
        } else {
          const sliders = sliderRef.current;
          const headAngleConfidence = pose.isFrontal ? 1.0 : pose.score;
          const jawEffectScale = this.jawGate.update(tracking.jawOpen, timestamp);
          const effectScale = headAngleConfidence * jawEffectScale;

          // Step 1: Deform lip submesh
          const lipDeformed = deformLipMesh(
            smoothedLandmarks,
            this.mesh,
            sliders,
            effectScale
          );

          // Step 2: Deform chin submesh
          const chinSliders = chinSliderRef?.current;
          const fullyDeformed = chinSliders
            ? deformChinMesh(lipDeformed, this.mesh, chinSliders, effectScale)
            : lipDeformed;

          renderWarpedFrame(
            ctx,
            video,
            w,
            h,
            smoothedLandmarks,
            fullyDeformed,
            this.mesh,
            { renderWireframe: wireframeRef.current }
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
    if (
      this.videoCallbackId !== null &&
      this.activeVideoElement &&
      'cancelVideoFrameCallback' in this.activeVideoElement
    ) {
      (this.activeVideoElement as any).cancelVideoFrameCallback(this.videoCallbackId);
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
