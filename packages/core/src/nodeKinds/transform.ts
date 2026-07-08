/**
 * TransformNode kind definition — per NODE_TYPES.md §3
 *
 * Purpose: a pure(ish) function over its inputs — the "logic" node.
 * - inputs: Port[] (one per parameter)
 * - outputs: [Port] (single output)
 * - config.body: string (raw function body, captured and replayed verbatim)
 * - Code shape: plain (non-async) function, tagged transform
 * - Validation: none beyond signature shape — body content is intentionally opaque
 */

import type { GraphNode, Port, PortType, TransformNodeConfig } from "../types.js";

export interface TransformNodeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a TransformNode against the NODE_TYPES.md §3 spec.
 */
export function validateTransformNode(node: GraphNode): TransformNodeValidation {
  const errors: string[] = [];

  if (node.kind !== "transform") {
    errors.push(`Expected kind "transform", got "${node.kind}"`);
  }

  // outputs must have exactly one port
  if (node.outputs.length !== 1) {
    errors.push(`TransformNode must have exactly one output, got ${node.outputs.length}`);
  }

  const config = node.config as Partial<TransformNodeConfig>;

  // body must be a string (can be empty for a no-op transform)
  if (typeof config.body !== "string") {
    errors.push(`TransformNode config.body must be a string`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a well-formed TransformNode.
 */
export function createTransformNode(params: {
  id: string;
  label: string;
  inputs: Array<{ name: string; type: PortType }>;
  outputType: PortType;
  body: string;
  position?: { x: number; y: number };
}): GraphNode {
  const config: TransformNodeConfig = {
    body: params.body,
  };

  const inputPorts: Port[] = params.inputs.map((inp, i) => ({
    id: `${params.id}_in_${i}`,
    name: inp.name,
    type: inp.type,
  }));

  const outputPort: Port = {
    id: `${params.id}_out`,
    name: "result",
    type: params.outputType,
  };

  return {
    id: params.id,
    kind: "transform",
    label: params.label,
    inputs: inputPorts,
    outputs: [outputPort],
    config,
    position: params.position ?? { x: 0, y: 0 },
  };
}
