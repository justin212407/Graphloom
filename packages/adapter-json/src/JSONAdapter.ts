/**
 * JSONAdapter — translates between a plain JSON serialization format and
 * GraphLoom's internal Graph type.
 *
 * The JSON shape is DELIBERATELY different from Graph to prove the adapter
 * interface does real translation, not a passthrough:
 *
 *   - Flat `x`/`y` fields on nodes instead of `position: { x, y }`
 *   - Edge tuples `[sourceNodeId, sourcePortId, targetNodeId, targetPortId]`
 *     instead of `{ source: { nodeId, portId }, target: { nodeId, portId } }`
 *   - Port arrays use `[id, name, type]` tuples instead of `{ id, name, type }`
 *   - No `version` field on the top-level object (version is a runtime concern,
 *     not a serialization concern — supplied externally on import)
 *
 * Per architecture.md Addendum A.
 */

import type { Graph, GraphNode, GraphEdge, NodeKind, PortType, Port } from '@graphloom/core';

// ─── JSON-side shapes (deliberately different from Graph) ───────────────────

/** A port in JSON form: [id, name, type] */
export type JsonPort = [id: string, name: string, type: string];

/** A node in JSON form: flat x/y, tuple ports */
export interface JsonNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  inputs?: JsonPort[];
  outputs?: JsonPort[];
  config?: Record<string, unknown>;
}

/** An edge in JSON form: [sourceNodeId, sourcePortId, targetNodeId, targetPortId] */
export type JsonEdge = [
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
];

/** The top-level JSON document shape — no version field */
export interface JsonGraph {
  id: string;
  nodes: JsonNode[];
  edges: JsonEdge[];
}

// ─── Default values for missing fields ──────────────────────────────────────

const DEFAULT_X = 0;
const DEFAULT_Y = 0;
const DEFAULT_KIND: NodeKind = 'transform';
const VALID_KINDS = new Set<string>(['input', 'fetch', 'transform', 'output']);

function isValidKind(k: string): k is NodeKind {
  return VALID_KINDS.has(k);
}

function isValidPortType(t: string): t is PortType {
  return ['string', 'number', 'boolean', 'object', 'array', 'any'].includes(t);
}

// ─── Conversion functions ───────────────────────────────────────────────────

/**
 * Convert a JSON document into a GraphLoom Graph.
 *
 * `version` must be supplied externally — the JSON shape intentionally
 * does not carry it (it's a runtime/sync concern, not a serialization concern).
 *
 * Missing fields get sensible defaults per EDGE_CASES.md addendum:
 *   - Missing x/y → 0
 *   - Missing kind → "transform"
 *   - Invalid kind → "transform"
 *   - Missing inputs/outputs → []
 *   - Missing config → {}
 *   - Invalid port type → "any"
 */
export function toGraphLoomGraph(json: JsonGraph, version: number): Graph {
  const nodes: GraphNode[] = json.nodes.map(jn => ({
    id: jn.id,
    kind: isValidKind(jn.kind) ? jn.kind : DEFAULT_KIND,
    label: jn.label ?? jn.id,
    inputs: (jn.inputs ?? []).map(portTupleToPort),
    outputs: (jn.outputs ?? []).map(portTupleToPort),
    config: jn.config ?? {},
    position: {
      x: typeof jn.x === 'number' ? jn.x : DEFAULT_X,
      y: typeof jn.y === 'number' ? jn.y : DEFAULT_Y,
    },
  }));

  const edges: GraphEdge[] = json.edges.map((tuple, i) => ({
    id: `edge-${i}`,
    source: { nodeId: tuple[0], portId: tuple[1] },
    target: { nodeId: tuple[2], portId: tuple[3] },
  }));

  return { id: json.id, nodes, edges, version };
}

/**
 * Convert a GraphLoom Graph back to the JSON serialization format.
 *
 * Version is intentionally dropped — it's not part of the JSON shape.
 */
export function fromGraphLoomGraph(graph: Graph): JsonGraph {
  const nodes: JsonNode[] = graph.nodes.map(n => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    x: n.position.x,
    y: n.position.y,
    inputs: n.inputs.map(portToTuple),
    outputs: n.outputs.map(portToTuple),
    config: n.config,
  }));

  const edges: JsonEdge[] = graph.edges.map(e => [
    e.source.nodeId,
    e.source.portId,
    e.target.nodeId,
    e.target.portId,
  ]);

  return { id: graph.id, nodes, edges };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function portTupleToPort(tuple: JsonPort): Port {
  return {
    id: tuple[0],
    name: tuple[1],
    type: isValidPortType(tuple[2]) ? tuple[2] : 'any',
  };
}

function portToTuple(port: Port): JsonPort {
  return [port.id, port.name, port.type];
}
