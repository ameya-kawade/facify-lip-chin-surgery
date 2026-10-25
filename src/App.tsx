import { useRef, useState, useCallback, useEffect } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { ParameterControls } from './components/ParameterControls';
import { ChinControls } from './components/ChinControls';
import { BeforeAfterToggle } from './components/BeforeAfterToggle';
import { ResetButton } from './components/ResetButton';
import { TrackingStatusBadge } from './components/TrackingStatusBadge';
import { LiveRenderer, RendererStatus } from './rendering/liveRenderer';
import { LipSliderParams, DEFAULT_LIP_SLIDERS } from './surgeries/lipAugmentation';
import { ChinSliderParams, DEFAULT_CHIN_SLIDERS } from './surgeries/chinSurgery';
import { Sparkles, Grid } from 'lucide-react';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // CRITICAL ARCHITECTURE RULE (Phase 6):
  // The per-frame 30-60fps render loop reads exclusively from these mutable refs,
  // NEVER from React useState.
  const sliderRef = useRef<LipSliderParams>({ ...DEFAULT_LIP_SLIDERS });
  const chinSliderRef = useRef<ChinSliderParams>({ ...DEFAULT_CHIN_SLIDERS });
  const isBeforeAfterActiveRef = useRef<boolean>(false);
  const wireframeRef = useRef<boolean>(false);

  // Active surgery tab: 'lips' or 'chin'
  const [activeTab, setActiveTab] = useState<'lips' | 'chin'>('lips');

  // Throttled UI status (updates ~3 times per second max)
  const [status, setStatus] = useState<RendererStatus>({
    fps: 0,
    faceDetected: false,
    isFrontal: true,
    confidence: 0,
    pose: { isFrontal: true, yaw: 0, pitch: 0, roll: 0, score: 1 },
  });

  const [wireframeActive, setWireframeActive] = useState<boolean>(false);
  const [resetCounter, setResetCounter] = useState(0);

  const rendererRef = useRef<LiveRenderer | null>(null);

  useEffect(() => {
    const renderer = new LiveRenderer();
    rendererRef.current = renderer;
    return () => {
      renderer.stop();
    };
  }, []);

  const handleVideoReady = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (rendererRef.current) {
      rendererRef.current.start({
        video,
        canvas,
        sliderRef,
        chinSliderRef,
        isBeforeAfterActiveRef,
        wireframeRef,
        onStatusUpdate: (newStatus) => {
          setStatus(newStatus);
        },
      });
    }
  }, []);

  const toggleWireframe = () => {
    const nextVal = !wireframeActive;
    wireframeRef.current = nextVal;
    setWireframeActive(nextVal);
  };

  const handleReset = () => {
    setResetCounter(c => c + 1);
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-navbar">
        <div className="brand-wrapper">
          <div className="brand-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="brand-title">Facify Surgery Preview</h1>
            <span className="brand-subtitle">Lip & Chin Clinical Simulator</span>
          </div>
        </div>

        <div className="navbar-actions">
          <button
            className={`btn-wireframe ${wireframeActive ? 'active' : ''}`}
            onClick={toggleWireframe}
            title="Toggle facial sub-mesh wireframe"
          >
            <Grid size={16} />
            <span>{wireframeActive ? 'Mesh On' : 'Mesh Overlay'}</span>
          </button>
          <ResetButton
            sliderRef={sliderRef}
            chinSliderRef={chinSliderRef}
            onReset={handleReset}
          />
        </div>
      </header>

      {/* Main Grid Viewport */}
      <main className="app-main">
        {/* Stage / Video Viewport */}
        <section className="stage-viewport">
          <CameraPreview onVideoReady={handleVideoReady} canvasRef={canvasRef} />

          {/* HUD Top Overlay */}
          <div className="stage-hud-top">
            <TrackingStatusBadge status={status} />
          </div>

          {/* HUD Bottom: Interactive Before/After Touch Button */}
          <div className="stage-hud-bottom">
            <BeforeAfterToggle isBeforeAfterActiveRef={isBeforeAfterActiveRef} />
          </div>
        </section>

        {/* Sidebar Controls */}
        <aside className="sidebar-panel">
          {/* Surgery Selector Tabs */}
          <div className="surgery-tab-bar">
            <button
              className={`surgery-tab-btn ${activeTab === 'lips' ? 'active' : ''}`}
              onClick={() => setActiveTab('lips')}
            >
              <span>👄 Lip Augmentation</span>
            </button>
            <button
              className={`surgery-tab-btn ${activeTab === 'chin' ? 'active' : ''}`}
              onClick={() => setActiveTab('chin')}
            >
              <span>🦹 Chin Surgery</span>
            </button>
          </div>

          {activeTab === 'lips' ? (
            <ParameterControls
              key={`lips-${resetCounter}`}
              sliderRef={sliderRef}
            />
          ) : (
            <ChinControls
              key={`chin-${resetCounter}`}
              chinSliderRef={chinSliderRef}
            />
          )}

          <div className="disclaimer-card">
            <strong>Clinical Simulation Advisory:</strong>
            <p>
              Real-time biomechanical simulation running entirely client-side.
              Preserves anatomical boundaries (mentolabial crease & vermilion border).
              Actual surgical outcomes may vary based on bone density and soft tissue response.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
