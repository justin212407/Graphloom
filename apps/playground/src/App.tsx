import Canvas from './Canvas';
import CodePane from './CodePane';
import DriftBanner from './DriftBanner';
import { useGraphLoom } from './useGraphLoom';

export default function App() {
  const {
    rfNodes, rfEdges, code, drift, conflictDiffs,
    onNodesChange, onEdgesChange, onConnect,
    onCodeChange, onNodeDragStop,
    onResolveConflict, onSimulateConflict,
  } = useGraphLoom();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="12" r="3" fill="#8b5cf6" />
            <circle cx="18" cy="6" r="3" fill="#22c55e" />
            <circle cx="18" cy="18" r="3" fill="#f43f5e" />
            <line x1="9" y1="12" x2="15" y2="6" stroke="#6366f1" strokeWidth="2" />
            <line x1="9" y1="12" x2="15" y2="18" stroke="#6366f1" strokeWidth="2" />
          </svg>
          <span>GraphLoom</span>
        </div>
        <span className="app-subtitle">Bidirectional Graph ⇄ Code Sync</span>
      </header>
      <div className="app-main">
        <Canvas
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
        />
        <div className="pane-divider" />
        <CodePane code={code} onChange={onCodeChange} />
      </div>
      <DriftBanner
        drift={drift}
        diffs={conflictDiffs}
        onResolve={onResolveConflict}
        onSimulateConflict={onSimulateConflict}
      />
    </div>
  );
}
