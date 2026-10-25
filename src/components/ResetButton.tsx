import React from 'react';
import { RotateCcw } from 'lucide-react';
import { LipSliderParams, DEFAULT_LIP_SLIDERS } from '../surgeries/lipAugmentation';
import { ChinSliderParams, DEFAULT_CHIN_SLIDERS } from '../surgeries/chinSurgery';

interface ResetButtonProps {
  sliderRef: React.MutableRefObject<LipSliderParams>;
  chinSliderRef?: React.MutableRefObject<ChinSliderParams>;
  onReset: () => void;
}

export const ResetButton: React.FC<ResetButtonProps> = ({
  sliderRef,
  chinSliderRef,
  onReset,
}) => {
  const handleReset = () => {
    sliderRef.current = { ...DEFAULT_LIP_SLIDERS };
    if (chinSliderRef) {
      chinSliderRef.current = { ...DEFAULT_CHIN_SLIDERS };
    }
    onReset();
  };

  return (
    <button className="btn-secondary" onClick={handleReset} title="Reset all adjustments to zero">
      <RotateCcw size={16} />
      <span>Reset All</span>
    </button>
  );
};
