import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { portTypeColor } from './portColors';

/**
 * FetchNode — wider card, dashed border, lightning-bolt icon, cyan accent.
 * Represents async/external data sources.
 */
export default function FetchNode({ data }: NodeProps) {
  const inputs = (data.inputs ?? []) as Array<{ id: string; name: string; type: string }>;
  const outputs = (data.outputs ?? []) as Array<{ id: string; name: string; type: string }>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const url = (config.urlTemplate as string) ?? '';

  return (
    <div className="graphloom-node node-kind-fetch" style={{ minWidth: 200 }}>
      <div className="node-header-bar" />
      <div className="node-header">
        <div className="node-icon">
          {/* Lightning bolt icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8 1L3 8H7L6 13L11 6H7L8 1Z" fill="currentColor" />
          </svg>
        </div>
        <span className="node-label">{data.label as string}</span>
        <span className="node-kind-badge">FETCH</span>
      </div>
      {url && (
        <div className="node-body">
          <span className="node-body-preview" title={url}>{url}</span>
        </div>
      )}

      {/* Input handles on the left */}
      {inputs.map((port, i) => (
        <Handle
          key={port.id}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            background: portTypeColor(port.type),
            top: `${((i + 1) / (inputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      {/* Output handles on the right */}
      {outputs.map((port, i) => (
        <Handle
          key={port.id}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            background: portTypeColor(port.type),
            top: `${((i + 1) / (outputs.length + 1)) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
