import type { DriftResult } from '@graphloom/core';
import DiffView from './DiffView';

interface DriftBannerProps {
  drift: DriftResult;
  diffs?: Record<string, { graphText: string; codeText: string }>;
  onResolve: (nodeId: string, keep: 'graph' | 'code') => void;
  onSimulateConflict: () => void;
}

export default function DriftBanner({ drift, diffs, onResolve, onSimulateConflict }: DriftBannerProps) {
  // Extract conflicting node IDs (nodes in BOTH changed sets)
  const conflictingNodeIds: string[] = [];
  if (drift.status === 'conflict') {
    conflictingNodeIds.push(...drift.graphChangedNodeIds);
  }

  if (drift.status !== 'conflict' || conflictingNodeIds.length === 0) {
    return null;
  }

  return (
    <div className="drift-banner-container">
      {/* Conflict detail panel */}
      <div className="drift-conflict-panel">
          <div className="drift-conflict-header">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L15 14H1L8 1Z" fill="#ffb4ab" stroke="#ffb4ab" />
              <text x="8" y="12" textAnchor="middle" fontSize="9" fill="#690005" fontWeight="bold">!</text>
            </svg>
            <span>The same node was edited on both the graph and code sides. Choose which version to keep for each node:</span>
          </div>
          <div className="drift-conflict-nodes">
            {conflictingNodeIds.map(nodeId => {
              const nodeDiff = diffs?.[nodeId];
              return (
                <div key={nodeId} className="drift-conflict-node-container">
                  <div className="drift-conflict-node-header">
                    <span className="conflict-node-id">{nodeId}</span>
                    <div className="conflict-actions">
                      <button className="conflict-btn conflict-btn-graph" onClick={() => onResolve(nodeId, 'graph')}>
                        Keep Graph
                      </button>
                      <button className="conflict-btn conflict-btn-code" onClick={() => onResolve(nodeId, 'code')}>
                        Keep Code
                      </button>
                    </div>
                  </div>
                  {nodeDiff && (
                    <DiffView graphText={nodeDiff.graphText} codeText={nodeDiff.codeText} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
