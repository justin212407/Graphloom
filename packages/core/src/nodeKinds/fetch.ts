/**
 * FetchNode kind definition — per NODE_TYPES.md §2
 *
 * Purpose: represents an async I/O boundary (API call, DB read, tool call).
 * - inputs: Port[] (one per function parameter)
 * - outputs: [Port] (single output, the resolved value)
 * - config.urlTemplate: string (supports ${paramName} interpolation)
 * - config.method: "GET" | "POST"
 * - Code shape: async function name(...) { ... }, tagged fetch
 * - Validation: must be async; must have a body that returns a value
 */

import type { GraphNode, Port, PortType, FetchNodeConfig } from "../types.js";

export interface FetchNodeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a FetchNode against the NODE_TYPES.md §2 spec.
 */
export function validateFetchNode(node: GraphNode): FetchNodeValidation {
  const errors: string[] = [];

  if (node.kind !== "fetch") {
    errors.push(`Expected kind "fetch", got "${node.kind}"`);
  }

  // outputs must have exactly one port
  if (node.outputs.length !== 1) {
    errors.push(`FetchNode must have exactly one output, got ${node.outputs.length}`);
  }

  const config = node.config as Partial<FetchNodeConfig>;

  // urlTemplate is required
  if (typeof config.urlTemplate !== "string" || config.urlTemplate.length === 0) {
    errors.push(`FetchNode config.urlTemplate must be a non-empty string`);
  }

  // method must be GET or POST
  if (config.method !== "GET" && config.method !== "POST") {
    errors.push(`FetchNode config.method must be "GET" or "POST", got "${config.method}"`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a well-formed FetchNode.
 */
export function createFetchNode(params: {
  id: string;
  label: string;
  inputs: Array<{ name: string; type: PortType }>;
  outputType: PortType;
  urlTemplate: string;
  method: "GET" | "POST";
  position?: { x: number; y: number };
}): GraphNode {
  const config: FetchNodeConfig = {
    urlTemplate: params.urlTemplate,
    method: params.method,
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
    kind: "fetch",
    label: params.label,
    inputs: inputPorts,
    outputs: [outputPort],
    config,
    position: params.position ?? { x: 0, y: 0 },
  };
}
