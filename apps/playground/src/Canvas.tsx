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
        defaultEdgeOptions={{ animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }}
      >
        <Background color="#2a2a3a" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            switch (n.type) {
              case 'input': return '#22c55e';
              case 'fetch': return '#06b6d4';
              case 'transform': return '#8b5cf6';
              case 'output': return '#f43f5e';
              default: return '#6b7280';
            }
          }}
          style={{ backgroundColor: '#1a1a24' }}
        />
      </ReactFlow>
    </div>
  );
}
