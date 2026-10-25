import React from 'react';
import { RendererStatus } from '../rendering/liveRenderer';
import { CheckCircle2, AlertTriangle, UserCheck, ShieldAlert, MicOff } from 'lucide-react';

interface TrackingStatusBadgeProps {
  status: RendererStatus;
}

export const TrackingStatusBadge: React.FC<TrackingStatusBadgeProps> = ({ status }) => {
  return (
    <div className="status-badge-container">
      <div className={`status-pill ${status.faceDetected ? 'online' : 'offline'}`}>
        {status.faceDetected ? (
          <>
            <UserCheck size={14} />
            <span>Face Tracked</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} />
            <span>No Face</span>
          </>
        )}
      </div>

      {status.faceDetected && (
        <div className={`status-pill ${status.isFrontal ? 'frontal' : 'angled'}`}>
          {status.isFrontal ? (
            <>
              <CheckCircle2 size={14} />
              <span>Frontal View</span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} />
              <span>Off-Angle (Reduced)</span>
            </>
          )}
        </div>
      )}

      {status.faceDetected && status.jawGateScale < 0.5 && (
        <div className="status-pill gated" title="Effect paused — jaw-open detected">
          <MicOff size={14} />
          <span>Close mouth to resume</span>
        </div>
      )}
      {status.faceDetected && status.jawGateScale >= 0.5 && status.gateReason && (
        <div className="status-pill gated" title="Deformation gated off for pose">
          <ShieldAlert size={14} />
          <span>{status.gateReason}</span>
        </div>
      )}

      <div className="status-pill fps">
        <span>{status.fps} FPS</span>
      </div>
    </div>
  );
};
