import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { portTypeColor } from './portColors';

/**
 * TransformNode — standard card, gear/cog icon, indigo/violet accent.
 * Shows function body preview and has input + output handles.
 */
export default function TransformNode({ data }: NodeProps) {
  const inputs = (data.inputs ?? []) as Array<{ id: string; name: string; type: string }>;
  const outputs = (data.outputs ?? []) as Array<{ id: string; name: string; type: string }>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const body = (config.body as string) ?? '';
  // Show first meaningful line of the body, truncated
  const preview = body.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';

  return (
    <div className="graphloom-node node-kind-transform">
      <div className="node-header-bar" />
      <div className="node-header">
        <div className="node-icon">
          {/* Gear/cog icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm5.35 1.7l-.93-.54a4.5 4.5 0 000-1.32l.93-.54a.5.5 0 00.18-.68l-1-1.74a.5.5 0 00-.68-.18l-.93.54a4.5 4.5 0 00-1.14-.66V.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v1.08a4.5 4.5 0 00-1.14.66l-.93-.54a.5.5 0 00-.68.18l-1 1.74a.5.5 0 00.18.68l.93.54a4.5 4.5 0 000 1.32l-.93.54a.5.5 0 00-.18.68l1 1.74a.5.5 0 00.68.18l.93-.54c.35.27.73.49 1.14.66V13.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1.08a4.5 4.5 0 001.14-.66l.93.54a.5.5 0 00.68-.18l1-1.74a.5.5 0 00-.18-.68z"
              fill="currentColor"
            />
          </svg>
        </div>
        <span className="node-label">{data.label as string}</span>
        <span className="node-kind-badge">TRANSFORM</span>
      </div>
      {preview && (
        <div className="node-body">
          <span className="node-body-preview" title={body}>{preview}</span>
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
