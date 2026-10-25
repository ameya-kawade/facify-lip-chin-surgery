import { OneEuroFilter } from './oneEuroFilter';

export class JawOpenGate {
  private blendshapeFilter = new OneEuroFilter({ minCutoff: 2.0, beta: 0.1 });
  private readonly OPEN_THRESH = 0.25;
  private readonly CLOSE_THRESH = 0.15;
  private readonly DEBOUNCE_FRAMES = 4;
  private consecutiveOpenFrames = 0;
  private consecutiveClosedFrames = 0;
  private isGatedOff = false;
  private currentScale = 1.0;

  update(rawJawOpen: number, timestampMs: number): number {
    const smoothed = this.blendshapeFilter.filter(rawJawOpen, timestampMs);

    if (smoothed > this.OPEN_THRESH) {
      this.consecutiveOpenFrames++;
      this.consecutiveClosedFrames = 0;
      if (this.consecutiveOpenFrames >= this.DEBOUNCE_FRAMES) {
        this.isGatedOff = true;
      }
    } else if (smoothed < this.CLOSE_THRESH) {
      this.consecutiveClosedFrames++;
      this.consecutiveOpenFrames = 0;
      if (this.consecutiveClosedFrames >= this.DEBOUNCE_FRAMES) {
        this.isGatedOff = false;
      }
    }

    const targetScale = this.isGatedOff ? 0.0 : 1.0;
    this.currentScale += (targetScale - this.currentScale) * 0.20; // 5-frame smooth lerp

    return this.currentScale;
  }

  reset(): void {
    this.blendshapeFilter.reset();
    this.consecutiveOpenFrames = 0;
    this.consecutiveClosedFrames = 0;
    this.isGatedOff = false;
    this.currentScale = 1.0;
  }
}
