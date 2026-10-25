import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertCircle } from 'lucide-react';

interface CameraPreviewProps {
  onVideoReady: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({ onVideoReady, canvasRef }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        setIsLoading(true);
        setError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            setIsLoading(false);
            if (videoRef.current && canvasRef.current) {
              onVideoReady(videoRef.current, canvasRef.current);
            }
          };
        }
      } catch (err) {
        console.error('Camera initialization failed:', err);
        setError('Camera access denied or unavailable. Please enable webcam permissions.');
        setIsLoading(false);
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onVideoReady, canvasRef]);

  return (
    <div className="preview-container">
      {/* Hidden raw video element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        style={{ display: 'none' }}
      />

      {/* Main visible rendering canvas */}
      <canvas
        ref={canvasRef}
        className="preview-canvas"
      />

      {isLoading && (
        <div className="preview-overlay">
          <Camera className="spin-icon" size={36} />
          <p>Requesting camera permission...</p>
        </div>
      )}

      {error && (
        <div className="preview-overlay error">
          <AlertCircle size={36} />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};
