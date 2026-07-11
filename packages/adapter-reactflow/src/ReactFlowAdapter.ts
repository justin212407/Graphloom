/**
 * ReactFlowAdapter — translates between React Flow state and GraphLoom Graph
 *
 * This is a PURE translation layer. It converts between React Flow's node/edge
 * format and GraphLoom's Graph type.
 *
 * Implementation: Day 3 per IMPLEMENTATION_PLAN.md
 */

import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { Graph, GraphNode, GraphEdge, NodeKind } from '@graphloom/core';

export interface ReactFlowState {
  nodes: RFNode[];
  edges: RFEdge[];
}

/**
 * Convert React Flow editor state to GraphLoom Graph.
 *
 * RF nodes store GraphLoom data in node.data:
 *   { kind, label, inputs, outputs, config }
 * RF edges use sourceHandle/targetHandle for port IDs.
 */
const VALID_KINDS = new Set<string>(['input', 'fetch', 'transform', 'output']);
const DEFAULT_KIND: NodeKind = 'transform';

export function toGraphLoomGraph(state: ReactFlowState, graphId: string, version: number): Graph {
  const nodes: GraphNode[] = state.nodes.map(rfNode => {
    const data = rfNode.data ?? {};
    const kind = String(data.kind);
    return {
      id: rfNode.id,
      kind: VALID_KINDS.has(kind) ? (kind as NodeKind) : DEFAULT_KIND,
      label: (data.label as string) ?? rfNode.id,
      inputs: (data.inputs as GraphNode['inputs']) ?? [],
      outputs: (data.outputs as GraphNode['outputs']) ?? [],
      config: (data.config as Record<string, unknown>) ?? {},
      position: {
        x: rfNode.position?.x ?? 0,
        y: rfNode.position?.y ?? 0,
      },
    };
  });

  const edges: GraphEdge[] = state.edges.map(rfEdge => ({
    id: rfEdge.id,
    source: { nodeId: rfEdge.source, portId: rfEdge.sourceHandle ?? `${rfEdge.source}_out` },
    target: { nodeId: rfEdge.target, portId: rfEdge.targetHandle ?? `${rfEdge.target}_in` },
  }));

  return { id: graphId, nodes, edges, version };
}

/**
 * Convert GraphLoom Graph to React Flow editor state.
 */
export function fromGraphLoomGraph(graph: Graph): ReactFlowState {
  const nodes: RFNode[] = graph.nodes.map(node => ({
    id: node.id,
    type: node.kind, // maps to custom node type components
    position: node.position,
    data: {
      kind: node.kind,
      label: node.label,
      inputs: node.inputs,
      outputs: node.outputs,
      config: node.config,
    },
  }));

  const edges: RFEdge[] = graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source.nodeId,
    target: edge.target.nodeId,
    sourceHandle: edge.source.portId,
    targetHandle: edge.target.portId,
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  }));

  return { nodes, edges };
}
