import React, { useState } from 'react';
import { ChinSliderParams, DEFAULT_CHIN_SLIDERS } from '../surgeries/chinSurgery';
import {
  Sliders, ArrowUpDown, MoveHorizontal, Compass, Sparkles, RefreshCw,
  AlignCenter, RotateCw, Indent,
} from 'lucide-react';

interface ChinControlsProps {
  chinSliderRef: React.MutableRefObject<ChinSliderParams>;
  onSliderChange?: () => void;
}

// ── Slider metadata ───────────────────────────────────────────────────────────
interface SliderDef {
  key: keyof ChinSliderParams;
  label: string;
  icon: React.ReactNode;
  min: number;
  max: number;
  step: number;
  hint?: string;
  formatValue?: (v: number) => string;
}

const fmt = (v: number, pos: string, neg: string, zero = '0 (Natural)') =>
  v > 0 ? `+${v} (${pos})` : v < 0 ? `${v} (${neg})` : zero;

const SLIDERS: SliderDef[] = [
  // ── Core controls ─────────────────────────────────────────────────────────
  {
    key: 'verticalLength',
    label: 'Vertical Length',
    icon: <ArrowUpDown size={16} />,
    min: -15, max: 15, step: 1,
    formatValue: v => fmt(v, 'Lengthen', 'Shorten'),
  },
  {
    key: 'projection',
    label: 'Contour Prominence',
    icon: <Compass size={16} />,
    min: -15, max: 15, step: 1,
    hint: 'Frontal 2D contour fullness (true sagittal requires profile view)',
    formatValue: v => fmt(v, 'Enhanced', 'Reduced'),
  },
  {
    key: 'chinWidth',
    label: 'Chin Width (V-Line)',
    icon: <MoveHorizontal size={16} />,
    min: -15, max: 15, step: 1,
    formatValue: v => fmt(v, 'Square', 'V-Line Tapered'),
  },
  // ── Advanced clinic-grade controls ────────────────────────────────────────
  {
    key: 'jawAngleWidth',
    label: 'Jaw Angle Width',
    icon: <AlignCenter size={16} />,
    min: -10, max: 10, step: 1,
    hint: 'Adjust the gonial angle width — broader jaw vs. slimmer lateral contour',
    formatValue: v => fmt(v, 'Wider Jaw', 'Narrower Jaw'),
  },
  {
    key: 'chinAsymmetryTilt',
    label: 'Chin Tilt / Asymmetry',
    icon: <RotateCw size={16} />,
    min: -10, max: 10, step: 1,
    hint: 'Shift the chin apex left (negative) or right (positive) to correct asymmetry',
    formatValue: v =>
      v > 0 ? `+${v} (Right)` : v < 0 ? `${v} (Left)` : '0 (Centred)',
  },
  {
    key: 'prejowlCorrection',
    label: 'Pre-Jowl Sulcus Fill',
    icon: <Indent size={16} />,
    min: -10, max: 10, step: 1,
    hint: 'Simulate volumetric fill of the pre-jowl depression lateral to the chin',
    formatValue: v => fmt(v, 'Filled', 'Hollow'),
  },
];

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS: { label: string; values: Partial<ChinSliderParams> }[] = [
  {
    label: 'Natural',
    values: { verticalLength: 5, projection: 6, chinWidth: -3, jawAngleWidth: 0, chinAsymmetryTilt: 0, prejowlCorrection: 2 },
  },
  {
    label: 'V-Line',
    values: { verticalLength: -3, projection: 3, chinWidth: -10, jawAngleWidth: -5, chinAsymmetryTilt: 0, prejowlCorrection: 0 },
  },
  {
    label: 'Defined',
    values: { verticalLength: 6, projection: 8, chinWidth: 8, jawAngleWidth: 6, chinAsymmetryTilt: 0, prejowlCorrection: 3 },
  },
  {
    label: 'Contoured',
    values: { verticalLength: 3, projection: 5, chinWidth: -6, jawAngleWidth: -3, chinAsymmetryTilt: 0, prejowlCorrection: 5 },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export const ChinControls: React.FC<ChinControlsProps> = ({
  chinSliderRef,
  onSliderChange,
}) => {
  const [localValues, setLocalValues] = useState<ChinSliderParams>({ ...chinSliderRef.current });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = (key: keyof ChinSliderParams, val: number) => {
    chinSliderRef.current[key] = val;
    setLocalValues(prev => ({ ...prev, [key]: val }));
    onSliderChange?.();
  };

  const applyPreset = (values: Partial<ChinSliderParams>) => {
    const merged = { ...DEFAULT_CHIN_SLIDERS, ...values };
    chinSliderRef.current = { ...merged };
    setLocalValues({ ...merged });
    onSliderChange?.();
  };

  const coreSliders = SLIDERS.slice(0, 3);
  const advancedSliders = SLIDERS.slice(3);

  return (
    <div className="controls-card">
      <div className="controls-header">
        <div className="header-title">
          <Sliders size={20} className="icon-accent" />
          <h3>Chin &amp; Jawline Simulation</h3>
        </div>
        <span className="badge-scope">Frontal 2D</span>
      </div>

      {/* ── Presets ── */}
      <div className="preset-row">
        {PRESETS.map(p => (
          <button
            key={p.label}
            className="btn-preset"
            onClick={() => applyPreset(p.values)}
            title={p.label}
          >
            {p.label === 'Natural' && <Sparkles size={13} />} {p.label}
          </button>
        ))}
        <button
          className="btn-preset btn-preset-reset"
          onClick={() => applyPreset(DEFAULT_CHIN_SLIDERS)}
          title="Reset chin sliders to 0"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Core Sliders ── */}
      <div className="slider-group">
        {coreSliders.map(s => (
          <SliderItem
            key={s.key}
            def={s}
            value={localValues[s.key]}
            onChange={val => updateParam(s.key, val)}
          />
        ))}
      </div>

      {/* ── Advanced Toggle ── */}
      <button
        className="advanced-toggle"
        onClick={() => setShowAdvanced(v => !v)}
      >
        <span className="advanced-toggle-label">
          {showAdvanced ? '▲' : '▼'} Advanced Clinic Controls
        </span>
      </button>

      {/* ── Advanced Sliders ── */}
      {showAdvanced && (
        <div className="slider-group slider-group--advanced">
          <div className="advanced-section-title">Fine-Tuning</div>
          {advancedSliders.map(s => (
            <SliderItem
              key={s.key}
              def={s}
              value={localValues[s.key]}
              onChange={val => updateParam(s.key, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Reusable SliderItem ───────────────────────────────────────────────────────
interface SliderItemProps {
  def: SliderDef;
  value: number;
  onChange: (v: number) => void;
}

const SliderItem: React.FC<SliderItemProps> = ({ def, value, onChange }) => {
  const display = def.formatValue ? def.formatValue(value) : value > 0 ? `+${value}` : `${value}`;
  return (
    <div className="slider-item" title={def.hint}>
      <div className="slider-label-row">
        <span className="slider-title">
          {def.icon} {def.label}
        </span>
        <span className="slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="slider-input"
      />
      <div className="slider-ticks">
        <span>{def.min}</span>
        <span>0 (Natural)</span>
        <span>+{def.max}</span>
      </div>
    </div>
  );
};
