import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface BeforeAfterToggleProps {
  isBeforeAfterActiveRef: React.MutableRefObject<boolean>;
}

export const BeforeAfterToggle: React.FC<BeforeAfterToggleProps> = ({ isBeforeAfterActiveRef }) => {
  const [isHoldingBefore, setIsHoldingBefore] = useState(false);

  const startShowBefore = () => {
    isBeforeAfterActiveRef.current = true;
    setIsHoldingBefore(true);
  };

  const stopShowBefore = () => {
    isBeforeAfterActiveRef.current = false;
    setIsHoldingBefore(false);
  };

  return (
    <button
      className={`btn-before-after ${isHoldingBefore ? 'active' : ''}`}
      onMouseDown={startShowBefore}
      onMouseUp={stopShowBefore}
      onMouseLeave={stopShowBefore}
      onTouchStart={startShowBefore}
      onTouchEnd={stopShowBefore}
      title="Hold down to compare with original appearance"
    >
      {isHoldingBefore ? <EyeOff size={18} /> : <Eye size={18} />}
      <span>{isHoldingBefore ? 'Viewing Original' : 'Hold for Original'}</span>
    </button>
  );
};
