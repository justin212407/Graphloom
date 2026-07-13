import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { portTypeColor } from './portColors';

/**
 * InputNode — stadium/pill shape, green accent, play icon.
 * Source node: only output handle(s), no input handles.
 */
export default function InputNode({ data }: NodeProps) {
  const outputs = (data.outputs ?? []) as Array<{ id: string; name: string; type: string }>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const defaultVal = config.defaultValue !== undefined ? String(config.defaultValue) : '—';

  return (
    <div className="graphloom-node node-kind-input">
      <div className="node-header-bar" />
      <div className="node-header">
        <div className="node-icon">
          {/* Play / arrow-right icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1.5L11.5 7L3 12.5V1.5Z" fill="currentColor" />
          </svg>
        </div>
        <span className="node-label">{data.label as string}</span>
        <span className="node-kind-badge">INPUT</span>
      </div>
      <div className="node-body">
        <span className="node-config-value">{defaultVal}</span>
      </div>

      {/* Output handles on the right */}
      {outputs.map((port, i) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
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
