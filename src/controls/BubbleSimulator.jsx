import { useState } from 'react';
import './BubbleSimulator.css';

function BubbleSimulator({ onBubbleInjected, bubbleDetected, onResetBubble }) {
  const [isActive, setIsActive] = useState(false);

  const handleInjectBubble = () => {
    setIsActive(true);
    onBubbleInjected();
  };

  const handleReset = () => {
    setIsActive(false);
    onResetBubble();
  };

  return (
    <div className="bubble-simulator control-section">
      <h3>Bubble Simulator</h3>
      <div className="bubble-controls">
        <button
          className={`bubble-button inject ${isActive ? 'active' : ''}`}
          onClick={handleInjectBubble}
          disabled={isActive}
        >
          {isActive ? 'Bubble Injected' : 'Inject Bubble'}
        </button>
        <button
          className="bubble-button reset"
          onClick={handleReset}
          disabled={!isActive && !bubbleDetected}
        >
          Reset Bubble
        </button>
      </div>
      <div className="bubble-status">
        <div className="status-item">
          <span className="status-label">Bubble Status:</span>
          <span className={`status-value ${bubbleDetected ? 'detected' : 'not-detected'}`}>
            {bubbleDetected ? 'DETECTED' : 'Not Detected'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BubbleSimulator;