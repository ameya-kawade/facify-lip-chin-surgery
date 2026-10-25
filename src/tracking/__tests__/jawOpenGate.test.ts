import { describe, it, expect } from 'vitest';
import { JawOpenGate } from '../jawOpenGate';

describe('JawOpenGate Hysteresis & Debounce (Phase 5 & 7)', () => {
  it('maintains scale 1.0 when mouth is relaxed and closed', () => {
    const gate = new JawOpenGate();
    let scale = 1.0;
    let t = 0;

    for (let i = 0; i < 20; i++) {
      t += 33;
      scale = gate.update(0.05, t); // closed mouth (~0.05)
    }

    expect(scale).toBeCloseTo(1.0, 2);
  });

  it('gates off effects when mouth is held open past debounce threshold', () => {
    const gate = new JawOpenGate();
    let scale = 1.0;
    let t = 0;

    // First closed
    for (let i = 0; i < 5; i++) {
      t += 33;
      scale = gate.update(0.05, t);
    }
    expect(scale).toBeCloseTo(1.0, 2);

    // Now open mouth sustained (> 0.25)
    for (let i = 0; i < 25; i++) {
      t += 33;
      scale = gate.update(0.60, t);
    }

    // Scale lerps down towards 0.0
    expect(scale).toBeLessThan(0.1);
  });

  it('restores scale back to 1.0 when mouth closes below close threshold', () => {
    const gate = new JawOpenGate();
    let t = 0;

    // Open mouth
    for (let i = 0; i < 25; i++) {
      t += 33;
      gate.update(0.60, t);
    }

    // Now close mouth (< 0.15)
    let scale = 0;
    for (let i = 0; i < 25; i++) {
      t += 33;
      scale = gate.update(0.05, t);
    }

    // Scale recovers back to 1.0
    expect(scale).toBeGreaterThan(0.95);
  });

  it('resets state completely on reset()', () => {
    const gate = new JawOpenGate();
    let t = 0;

    // Open mouth
    for (let i = 0; i < 25; i++) {
      t += 33;
      gate.update(0.60, t);
    }

    gate.reset();
    // Immediate closed frame starts from fresh state
    const scale = gate.update(0.05, 100);
    expect(scale).toBeCloseTo(1.0, 2);
  });
});
