import React, { useState } from 'react';
import { LipSliderParams } from '../surgeries/lipAugmentation';
import { Sliders, Sparkles, ChevronUp, ChevronDown, Maximize2 } from 'lucide-react';

interface ParameterControlsProps {
  sliderRef: React.MutableRefObject<LipSliderParams>;
  onSliderChange?: () => void;
}

export const ParameterControls: React.FC<ParameterControlsProps> = ({
  sliderRef,
  onSliderChange,
}) => {
  // Local state purely to animate the UI slider thumb positions correctly
  const [localValues, setLocalValues] = useState<LipSliderParams>({ ...sliderRef.current });

  const updateParam = (key: keyof LipSliderParams, val: number) => {
    // 1. Direct mutation on ref consumed by 60fps render loop (no React state lag)
    sliderRef.current[key] = val;
    // 2. Local state update for the slider visual UI thumb
    setLocalValues(prev => ({ ...prev, [key]: val }));
    onSliderChange?.();
  };

  return (
    <div className="controls-card">
      <div className="controls-header">
        <div className="header-title">
          <Sliders size={20} className="icon-accent" />
          <h3>Lip Augmentation Simulation</h3>
        </div>
        <span className="badge-scope">Frontal View</span>
      </div>

      <div className="slider-group">
        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <ChevronUp size={16} /> Upper Lip Fullness
            </span>
            <span className="slider-value">{localValues.upperFullness > 0 ? `+${localValues.upperFullness}` : localValues.upperFullness}</span>
          </div>
          <input
            type="range"
            min="-20"
            max="20"
            step="1"
            value={localValues.upperFullness}
            onChange={e => updateParam('upperFullness', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-20</span>
            <span>0 (Natural)</span>
            <span>+20</span>
          </div>
        </div>

        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <ChevronDown size={16} /> Lower Lip Fullness
            </span>
            <span className="slider-value">{localValues.lowerFullness > 0 ? `+${localValues.lowerFullness}` : localValues.lowerFullness}</span>
          </div>
          <input
            type="range"
            min="-20"
            max="20"
            step="1"
            value={localValues.lowerFullness}
            onChange={e => updateParam('lowerFullness', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-20</span>
            <span>0 (Natural)</span>
            <span>+20</span>
          </div>
        </div>

        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <Sparkles size={16} /> Overall Fullness
            </span>
            <span className="slider-value">{localValues.overallFullness > 0 ? `+${localValues.overallFullness}` : localValues.overallFullness}</span>
          </div>
          <input
            type="range"
            min="-20"
            max="20"
            step="1"
            value={localValues.overallFullness}
            onChange={e => updateParam('overallFullness', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-20</span>
            <span>0 (Natural)</span>
            <span>+20</span>
          </div>
        </div>

        <div className="slider-item">
          <div className="slider-label-row">
            <span className="slider-title">
              <Maximize2 size={16} /> Lip Width
            </span>
            <span className="slider-value">{localValues.lipWidth > 0 ? `+${localValues.lipWidth}` : localValues.lipWidth}</span>
          </div>
          <input
            type="range"
            min="-15"
            max="15"
            step="1"
            value={localValues.lipWidth}
            onChange={e => updateParam('lipWidth', parseInt(e.target.value, 10))}
            className="slider-input"
          />
          <div className="slider-ticks">
            <span>-15</span>
            <span>0</span>
            <span>+15</span>
          </div>
        </div>
      </div>
    </div>
  );
};
