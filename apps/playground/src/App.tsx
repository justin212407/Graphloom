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
            <circle cx="6" cy="12" r="3" fill="#7D6B91" />
            <circle cx="18" cy="6" r="3" fill="#5C7C99" />
            <circle cx="18" cy="18" r="3" fill="#6B8E6D" />
            <line x1="9" y1="12" x2="15" y2="6" stroke="#8e9192" strokeWidth="1" />
            <line x1="9" y1="12" x2="15" y2="18" stroke="#8e9192" strokeWidth="1" />
          </svg>
          <span>GraphLoom</span>
        </div>
        <div className={`drift-status drift-status-${drift.status}`}>
          <span className="drift-status-dot" />
          <span className="drift-status-text">
            {drift.status === 'clean' && 'Synced'}
            {drift.status === 'graph-ahead' && 'Graph changed'}
            {drift.status === 'code-ahead' && 'Code changed'}
            {drift.status === 'both-ahead' && 'Both changed (disjoint)'}
            {drift.status === 'conflict' && 'Conflict detected'}
          </span>
          <button className="simulate-btn" onClick={onSimulateConflict} title="Simulate an external code edit to trigger a conflict">
            ⚡ Simulate Conflict
          </button>
        </div>
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
