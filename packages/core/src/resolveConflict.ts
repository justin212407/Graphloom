/**
 * resolveConflict — per-node conflict resolution per CONFLICT_DETECTION.md §3
 */

import type { Graph, SyncSnapshot, GraphNode, GraphEdge } from "./types.js";
import { codeToGraph } from "./codeToGraph.js";
import { graphToCode } from "./graphToCode.js";
import { hashCode } from "./astUtils.js";

/**
 * Resolves a conflict for a specific nodeId by updating the SyncSnapshot for that node only.
 *
 * @param nodeId - The ID of the conflicting node to resolve
 * @param keep - Whether to keep the "graph" version or the "code" version of the node
 * @param currentGraph - Current Graph state in the editor/canvas
 * @param currentCode - Current Code state in the editor
 * @param prevSnapshot - Last successful sync snapshot
 * @returns An updated SyncSnapshot with the resolved state for the node
 */
export function resolveConflict(
  nodeId: string,
  keep: "graph" | "code",
  currentGraph: Graph,
  currentCode: string,
  prevSnapshot: SyncSnapshot
): SyncSnapshot {
  // 1. Parse current code to see what the code-side nodes look like
  const { graph: parsedGraph } = codeToGraph(currentCode, prevSnapshot);

  // 2. Locate the node on both sides
  const graphNode = currentGraph.nodes.find(n => n.id === nodeId);
  const codeNode = parsedGraph.nodes.find(n => n.id === nodeId);

  // 3. Construct the resolved node state
  const resolvedNode = keep === "graph" ? graphNode : codeNode;

  // 4. Construct the resolved edges connected to this node
  const sourceEdges = keep === "graph" ? currentGraph.edges : parsedGraph.edges;
  const resolvedNodeEdges = sourceEdges.filter(
    e => e.source.nodeId === nodeId || e.target.nodeId === nodeId
  );

  // 5. Build the new snapshot graph by copying prevSnapshot's graph
  const snapshotNodes = [...prevSnapshot.graph.nodes];
  const nodeIndex = snapshotNodes.findIndex(n => n.id === nodeId);

  if (resolvedNode) {
    if (nodeIndex !== -1) {
      snapshotNodes[nodeIndex] = resolvedNode;
    } else {
      snapshotNodes.push(resolvedNode);
    }
  } else {
    // Deleted
    if (nodeIndex !== -1) {
      snapshotNodes.splice(nodeIndex, 1);
    }
  }

  // Build new snapshot edges:
  // Remove all previous edges connected to this nodeId, and add the resolved ones
  const snapshotEdges = prevSnapshot.graph.edges.filter(
    e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
  );
  snapshotEdges.push(...resolvedNodeEdges);

  const snapshotGraph: Graph = {
    id: prevSnapshot.graph.id,
    nodes: snapshotNodes,
    edges: snapshotEdges,
    version: prevSnapshot.graphVersion + 1,
  };

  // 6. Generate the resolved snapshot code and mapping by patching in place
  const { code: newCode, mapping: newMapping } = graphToCode(snapshotGraph, prevSnapshot);

  return {
    graphVersion: snapshotGraph.version,
    codeHash: hashCode(newCode),
    code: newCode,
    graph: snapshotGraph,
    mapping: newMapping,
    timestamp: Date.now(),
  };
}
