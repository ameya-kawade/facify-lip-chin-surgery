import React, { useState } from 'react';
import { LipSliderParams, DEFAULT_LIP_SLIDERS } from '../surgeries/lipAugmentation';
import {
  Sliders, Sparkles, ChevronUp, ChevronDown, Maximize2,
  Star, Smile, Layers, RefreshCw,
} from 'lucide-react';

interface ParameterControlsProps {
  sliderRef: React.MutableRefObject<LipSliderParams>;
  onSliderChange?: () => void;
}

// ── Slider metadata ───────────────────────────────────────────────────────────
interface SliderDef {
  key: keyof LipSliderParams;
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
    key: 'upperFullness',
    label: 'Upper Lip Fullness',
    icon: <ChevronUp size={16} />,
    min: -20, max: 20, step: 1,
    formatValue: v => fmt(v, 'Fuller', 'Thinner'),
  },
  {
    key: 'lowerFullness',
    label: 'Lower Lip Fullness',
    icon: <ChevronDown size={16} />,
    min: -20, max: 20, step: 1,
    formatValue: v => fmt(v, 'Fuller', 'Thinner'),
  },
  {
    key: 'overallFullness',
    label: 'Overall Fullness',
    icon: <Sparkles size={16} />,
    min: -20, max: 20, step: 1,
    formatValue: v => fmt(v, 'Fuller', 'Thinner'),
  },
  {
    key: 'lipWidth',
    label: 'Lip Width',
    icon: <Maximize2 size={16} />,
    min: -15, max: 15, step: 1,
    formatValue: v => fmt(v, 'Wider', 'Narrower'),
  },
  // ── Advanced clinic-grade controls ────────────────────────────────────────
  {
    key: 'cupidsBowDefinition',
    label: "Cupid's Bow Definition",
    icon: <Star size={16} />,
    min: -10, max: 10, step: 1,
    hint: "Sharpen or flatten the upper lip's double-peak arch",
    formatValue: v => fmt(v, 'Sharper', 'Flatter'),
  },
  {
    key: 'cornerLift',
    label: 'Corner Lift',
    icon: <Smile size={16} />,
    min: -10, max: 10, step: 1,
    hint: 'Elevate or droop the mouth corners (smile vs neutral/sad arc)',
    formatValue: v => fmt(v, 'Lifted', 'Drooped'),
  },
  {
    key: 'philtrumProjection',
    label: 'Philtrum Projection',
    icon: <Layers size={16} />,
    min: -10, max: 10, step: 1,
    hint: 'Project or retract the central philtrum column above the upper lip',
    formatValue: v => fmt(v, 'Projected', 'Retracted'),
  },
];

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS: { label: string; values: Partial<LipSliderParams> }[] = [
  {
    label: 'Natural',
    values: { upperFullness: 4, lowerFullness: 6, overallFullness: 2, lipWidth: 0, cupidsBowDefinition: 2, cornerLift: 1, philtrumProjection: 1 },
  },
  {
    label: 'Pouty',
    values: { upperFullness: 8, lowerFullness: 12, overallFullness: 5, lipWidth: 2, cupidsBowDefinition: 3, cornerLift: 0, philtrumProjection: 2 },
  },
  {
    label: 'Classic',
    values: { upperFullness: 5, lowerFullness: 8, overallFullness: 3, lipWidth: 0, cupidsBowDefinition: 5, cornerLift: 2, philtrumProjection: 3 },
  },
  {
    label: 'Bold',
    values: { upperFullness: 12, lowerFullness: 16, overallFullness: 8, lipWidth: 4, cupidsBowDefinition: 0, cornerLift: 0, philtrumProjection: 0 },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export const ParameterControls: React.FC<ParameterControlsProps> = ({
  sliderRef,
  onSliderChange,
}) => {
  const [localValues, setLocalValues] = useState<LipSliderParams>({ ...sliderRef.current });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateParam = (key: keyof LipSliderParams, val: number) => {
    sliderRef.current[key] = val;
    setLocalValues(prev => ({ ...prev, [key]: val }));
    onSliderChange?.();
  };

  const applyPreset = (values: Partial<LipSliderParams>) => {
    const merged = { ...DEFAULT_LIP_SLIDERS, ...values };
    sliderRef.current = { ...merged };
    setLocalValues({ ...merged });
    onSliderChange?.();
  };

  const coreSliders = SLIDERS.slice(0, 4);
  const advancedSliders = SLIDERS.slice(4);

  return (
    <div className="controls-card">
      <div className="controls-header">
        <div className="header-title">
          <Sliders size={20} className="icon-accent" />
          <h3>Lip Augmentation Simulation</h3>
        </div>
        <span className="badge-scope">Frontal View</span>
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
            {p.label}
          </button>
        ))}
        <button
          className="btn-preset btn-preset-reset"
          onClick={() => applyPreset(DEFAULT_LIP_SLIDERS)}
          title="Reset all lip sliders"
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
