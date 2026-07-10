import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { portTypeColor } from './portColors';

/**
 * OutputNode — rounded rectangle, flag/target icon, rose/red accent.
 * Terminal node: only input handle(s), no output handles.
 */
export default function OutputNode({ data }: NodeProps) {
  const inputs = (data.inputs ?? []) as Array<{ id: string; name: string; type: string }>;

  return (
    <div className="graphloom-node node-kind-output">
      <div className="node-header-bar" />
      <div className="node-header">
        <div className="node-icon">
          {/* Flag/target icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1v12M3 2h7l-2 3 2 3H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="node-label">{data.label as string}</span>
        <span className="node-kind-badge">OUTPUT</span>
      </div>

      {/* Input handles on the left */}
      {inputs.map((port, i) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            background: portTypeColor(port.type),
            top: `${50 + i * 20}%`,
          }}
        />
      ))}
    </div>
  );
}
