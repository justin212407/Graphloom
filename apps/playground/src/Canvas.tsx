import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Node,
  type Edge,
} from '@xyflow/react';
import { nodeTypes } from './nodes';

interface CanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeDragStop: () => void;
}

export default function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
}: CanvasProps) {
  return (
    <div className="canvas-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: true,
          style: {
            stroke: 'var(--outline)',
            strokeWidth: 1,
            strokeDasharray: '6 4',
          },
        }}
      >
        <Background color="#2a2a2a" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            switch (n.type) {
              case 'input': return '#5C7C99';
              case 'fetch': return '#7D6B91';
              case 'transform': return '#B58B5C';
              case 'output': return '#6B8E6D';
              default: return '#8e9192';
            }
          }}
          style={{ backgroundColor: '#0e0e0e' }}
        />
      </ReactFlow>
    </div>
  );
}
