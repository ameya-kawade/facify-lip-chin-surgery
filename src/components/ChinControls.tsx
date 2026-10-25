import React, { useState } from 'react';
import { ChinSliderParams, DEFAULT_CHIN_SLIDERS } from '../surgeries/chinSurgery';
import { Sliders, ArrowUpDown, MoveHorizontal, Compass, Sparkles, RefreshCw } from 'lucide-react';

interface ChinControlsProps {
  chinSliderRef: React.MutableRefObject<ChinSliderParams>;
  onSliderChange?: () => void;
}

export const ChinControls: React.FC<ChinControlsProps> = ({
  chinSliderRef,
  onSliderChange,
}) => {
  const [localValues, setLocalValues] = useState<ChinSliderParams>({ ...chinSliderRef.current });

  const updateParam = (key: keyof ChinSliderParams, val: number) => {
    chinSliderRef.current[key] = val;
    setLocalValues(prev => ({ ...prev, [key]: val }));
    onSliderChange?.();
  };

  const applyPreset = (preset: ChinSliderParams) => {
    chinSliderRef.current = { ...preset };
    setLocalValues({ ...preset });
    onSliderChange?.();
  };

  return (
    <div className="controls-card">
      <div className="controls-header">
        <div className="header-title">
          <Sliders size={20} className="icon-accent" />
          <h3>Chin & Jawline Simulation</h3>
        </div>
        <span className="badge-scope">Genioplasty</span>
      </div>

      {/* Preset Quick Actions */}
      <div className="preset-row">
        <button
          className="btn-preset"
          onClick={() => applyPreset({ verticalLength: 4, projection: 6, chinWidth: -2 })}
          title="Subtle vertical elongation with projection"
        >
          <Sparkles size={13} /> Natural
        </button>
        <button
          className="btn-preset"
          onClick={() => applyPreset({ verticalLength: -2, projection: 3, chinWidth: -10 })}
          title="Tapered V-line contour"
        >
          V-Line
        </button>
        <button
          className="btn-preset"
          onClick={() => applyPreset({ verticalLength: 5, projection: 8, chinWidth: 7 })}
          title="Broad, prominent masculine jawline"
        >
          Defined
        </button>
        <button
          className="btn-preset btn-preset-reset"
          onClick={() => applyPreset(DEFAULT_CHIN_SLIDERS)}
          title="Reset chin sliders to 0"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="slider-group">
        {/* 1. Vertical Length */}
        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <ArrowUpDown size={16} /> Vertical Length
            </span>
            <span className="slider-value">
              {localValues.verticalLength > 0
                ? `+${localValues.verticalLength} (Lengthen)`
                : localValues.verticalLength < 0
                ? `${localValues.verticalLength} (Shorten)`
                : '0 (Natural)'}
            </span>
          </div>
          <input
            type="range"
            min="-15"
            max="15"
            step="1"
            value={localValues.verticalLength}
            onChange={e => updateParam('verticalLength', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-15 (Shorten)</span>
            <span>0</span>
            <span>+15 (Lengthen)</span>
          </div>
        </div>

        {/* 2. Chin Projection */}
        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <Compass size={16} /> Chin Projection
            </span>
            <span className="slider-value">
              {localValues.projection > 0
                ? `+${localValues.projection} (Advance)`
                : localValues.projection < 0
                ? `${localValues.projection} (Setback)`
                : '0 (Natural)'}
            </span>
          </div>
          <input
            type="range"
            min="-15"
            max="15"
            step="1"
            value={localValues.projection}
            onChange={e => updateParam('projection', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-15 (Setback)</span>
            <span>0</span>
            <span>+15 (Advance)</span>
          </div>
        </div>

        {/* 3. Chin Width / V-Line */}
        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <MoveHorizontal size={16} /> Chin Width (V-Line)
            </span>
            <span className="slider-value">
              {localValues.chinWidth > 0
                ? `+${localValues.chinWidth} (Square)`
                : localValues.chinWidth < 0
                ? `${localValues.chinWidth} (V-Line)`
                : '0 (Natural)'}
            </span>
          </div>
          <input
            type="range"
            min="-15"
            max="15"
            step="1"
            value={localValues.chinWidth}
            onChange={e => updateParam('chinWidth', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-15 (Tapered)</span>
            <span>0</span>
            <span>+15 (Square)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
