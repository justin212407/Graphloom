/**
 * InputNode kind definition — per NODE_TYPES.md §1
 *
 * Purpose: declares an entry point value for the graph.
 * - inputs: [] (none — this is a source)
 * - outputs: [{ id, name, type }] (exactly one port, the declared value)
 * - config.defaultValue: unknown? (optional; used for playground preview execution)
 * - Code shape: const x = defineInput<T>("name")
 * - Validation: name must be a valid JS identifier; type must be a known PortType
 */

import type { GraphNode, Port, PortType, InputNodeConfig } from "../types.js";

/** Valid JavaScript identifier pattern */
const JS_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Known PortType values for validation */
const KNOWN_PORT_TYPES: Set<PortType> = new Set([
  "string", "number", "boolean", "object", "array", "any",
]);

export interface InputNodeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an InputNode against the NODE_TYPES.md §1 spec.
 */
export function validateInputNode(node: GraphNode): InputNodeValidation {
  const errors: string[] = [];

  if (node.kind !== "input") {
    errors.push(`Expected kind "input", got "${node.kind}"`);
  }

  // inputs must be empty (this is a source node)
  if (node.inputs.length !== 0) {
    errors.push(`InputNode must have zero inputs, got ${node.inputs.length}`);
  }

  // outputs must have exactly one port
  if (node.outputs.length !== 1) {
    errors.push(`InputNode must have exactly one output, got ${node.outputs.length}`);
  }

  // label must be a valid JS identifier (used as variable name in code)
  if (!JS_IDENTIFIER_RE.test(node.label)) {
    errors.push(`InputNode label "${node.label}" is not a valid JS identifier`);
  }

  // output port type must be a known PortType
  if (node.outputs.length === 1 && !KNOWN_PORT_TYPES.has(node.outputs[0].type)) {
    errors.push(`InputNode output port type "${node.outputs[0].type}" is not a known PortType`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a well-formed InputNode.
 */
export function createInputNode(params: {
  id: string;
  label: string;
  outputType: PortType;
  defaultValue?: unknown;
  position?: { x: number; y: number };
}): GraphNode {
  const config: InputNodeConfig = {};
  if (params.defaultValue !== undefined) {
    config.defaultValue = params.defaultValue;
  }

  const outputPort: Port = {
    id: `${params.id}_out`,
    name: params.label,
    type: params.outputType,
  };

  return {
    id: params.id,
    kind: "input",
    label: params.label,
    inputs: [],
    outputs: [outputPort],
    config,
    position: params.position ?? { x: 0, y: 0 },
  };
}
