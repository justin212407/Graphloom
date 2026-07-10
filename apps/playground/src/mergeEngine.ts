import { codeToGraph, graphToCode, hashCode } from '@graphloom/core';
import type { Graph, SyncSnapshot, DriftResult } from '@graphloom/core';

export interface MergeResult {
  code: string;
  graph: Graph;
  snapshot: SyncSnapshot;
}

/**
 * Merges disjoint edits when both sides are ahead (status: "both-ahead").
 * 
 * It:
 * 1. Parses the new hand-edited code to extract its graph structure (containing Node B's code-side changes).
 * 2. Overwrites the configurations of the graph-side changed nodes (Node A) in this code-side graph
 *    with their new configurations from the canvas graph.
 * 3. Runs graphToCode on the resulting merged graph, patching it in-place into the hand-edited code.
 * 4. Parses the merged code back to generate a fully unified and stable Graph and Mapping.
 */
export function mergeDisjointEdits(
  canvasGraph: Graph,
  editorCode: string,
  snapshot: SyncSnapshot,
  driftResult: DriftResult
): MergeResult {
  if (driftResult.status !== 'both-ahead') {
    throw new Error(`mergeDisjointEdits called with status ${driftResult.status}, expected both-ahead`);
  }

  // 1. Parse code-side changed code to get its target structure/mapping
  const parsed = codeToGraph(editorCode, snapshot);
  if (parsed.warnings.some(w => w.toLowerCase().includes('error'))) {
    throw new Error('Code has semantic validation errors; merge aborted');
  }

  // 2. Construct the merged graph:
  // Start with parsed.graph (containing Node B's latest code-side changes)
  const mergedGraph: Graph = JSON.parse(JSON.stringify(parsed.graph));
  mergedGraph.version = canvasGraph.version;

  // Copy the canvas-side node properties for all graphChangedNodeIds
  for (const nodeId of driftResult.graphChangedNodeIds) {
    const canvasNode = canvasGraph.nodes.find(n => n.id === nodeId);
    const mergedNodeIndex = mergedGraph.nodes.findIndex(n => n.id === nodeId);
    if (canvasNode && mergedNodeIndex !== -1) {
      mergedGraph.nodes[mergedNodeIndex].config = JSON.parse(JSON.stringify(canvasNode.config));
      mergedGraph.nodes[mergedNodeIndex].label = canvasNode.label;
      mergedGraph.nodes[mergedNodeIndex].inputs = JSON.parse(JSON.stringify(canvasNode.inputs));
      mergedGraph.nodes[mergedNodeIndex].outputs = JSON.parse(JSON.stringify(canvasNode.outputs));
    }
  }

  // 3. Create target snapshot using the parsed mapping
  const targetSnapshot: SyncSnapshot = {
    graphVersion: snapshot.graphVersion,
    codeHash: hashCode(editorCode),
    code: editorCode,
    graph: parsed.graph,
    mapping: parsed.mapping,
    timestamp: Date.now(),
  };

  // 4. Patch graph-side changes into the targetSnapshot's code
  const patchResult = graphToCode(mergedGraph, targetSnapshot);

  // 5. Parse final code back to get stable mapping/graph
  const finalResult = codeToGraph(patchResult.code, targetSnapshot);
  if (finalResult.warnings.some(w => w.toLowerCase().includes('error'))) {
    throw new Error('Merged code has semantic validation errors; merge aborted');
  }

  const finalSnapshot: SyncSnapshot = {
    graphVersion: mergedGraph.version,
    codeHash: hashCode(patchResult.code),
    code: patchResult.code,
    graph: finalResult.graph,
    mapping: finalResult.mapping,
    timestamp: Date.now(),
  };

  return {
    code: patchResult.code,
    graph: finalResult.graph,
    snapshot: finalSnapshot,
  };
}
