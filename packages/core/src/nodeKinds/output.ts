/**
 * OutputNode kind definition — per NODE_TYPES.md §4
 *
 * Purpose: terminal node. Every graph has exactly one.
 * - inputs: [Port] (single input, whatever the pipeline resolves to)
 * - outputs: [] (none — this is a sink)
 * - config: {} (no configuration)
 * - Code shape: function tagged output, called by nothing else
 */

import type { GraphNode, Port, PortType, OutputNodeConfig } from "../types.js";

export interface OutputNodeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an OutputNode against the NODE_TYPES.md §4 spec.
 */
export function validateOutputNode(node: GraphNode): OutputNodeValidation {
  const errors: string[] = [];

  if (node.kind !== "output") {
    errors.push(`Expected kind "output", got "${node.kind}"`);
  }

  // inputs must have exactly one port
  if (node.inputs.length !== 1) {
    errors.push(`OutputNode must have exactly one input, got ${node.inputs.length}`);
  }

  // outputs must be empty (this is a sink node)
  if (node.outputs.length !== 0) {
    errors.push(`OutputNode must have zero outputs, got ${node.outputs.length}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a well-formed OutputNode.
 */
export function createOutputNode(params: {
  id: string;
  label: string;
  inputType: PortType;
  position?: { x: number; y: number };
}): GraphNode {
  const config: OutputNodeConfig = {};

  const inputPort: Port = {
    id: `${params.id}_in`,
    name: "value",
    type: params.inputType,
  };

  return {
    id: params.id,
    kind: "output",
    label: params.label,
    inputs: [inputPort],
    outputs: [],
    config,
    position: params.position ?? { x: 0, y: 0 },
  };
}
