/**
 * detectDrift — drift detection per CONFLICT_DETECTION.md
 */

import { Node } from "ts-morph";
import type { Graph, SyncSnapshot, DriftResult, GraphNode } from "./types.js";
import { createProject, createSourceFile } from "./astUtils.js";

function getGraphLoomKind(node: Node): string | null {
  const ranges = node.getLeadingCommentRanges();
  for (const range of ranges) {
    const text = range.getText();
    const match = text.match(/@graphloom:node\s+(\w+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function getBlockSpan(node: Node): { start: number; end: number } {
  const ranges = node.getLeadingCommentRanges();
  const start = ranges.length > 0 ? ranges[0].getPos() : node.getStart();
  const end = node.getEnd();
  return { start, end };
}

function areConfigsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function arePortsEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].type !== b[i].type) {
      return false;
    }
  }
  return true;
}

/**
 * Compares two GraphNode objects ignoring position.
 */
function isNodeGraphicallyEqual(a: GraphNode, b: GraphNode): boolean {
  if (a.kind !== b.kind) return false;
  if (a.label !== b.label) return false;
  if (!arePortsEqual(a.inputs, b.inputs)) return false;
  if (!arePortsEqual(a.outputs, b.outputs)) return false;
  if (!areConfigsEqual(a.config, b.config)) return false;
  return true;
}

/**
 * detectDrift
 *
 * Compares current graph and code states against the last successful sync snapshot.
 *
 * @param currentGraph - Current Graph state
 * @param currentCode - Current Code in editor
 * @param prevSnapshot - Last successful sync snapshot
 * @returns DriftResult
 */
export function detectDrift(
  currentGraph: Graph,
  currentCode: string,
  prevSnapshot: SyncSnapshot
): DriftResult {
  // 1. Compute graphChangedNodeIds
  const graphChangedNodeIds: string[] = [];

  // 1a. Node-level changes: modified, added, or deleted nodes
  for (const node of currentGraph.nodes) {
    const prevNode = prevSnapshot.graph.nodes.find(n => n.id === node.id);
    if (!prevNode || !isNodeGraphicallyEqual(node, prevNode)) {
      graphChangedNodeIds.push(node.id);
    }
  }

  // Check for deleted nodes
  for (const prevNode of prevSnapshot.graph.nodes) {
    if (!currentGraph.nodes.some(n => n.id === prevNode.id)) {
      graphChangedNodeIds.push(prevNode.id);
    }
  }

  // 1b. Edge-level changes: added, removed, or rewired edges.
  //
  // SPEC NOTE: CONFLICT_DETECTION.md §2 is silent on edges — it only mentions
  // walking nodes. However, graphToCode's call-site generation (SYNC_ENGINE.md §1)
  // depends on edge topology, so a pure rewire (no node fields changed) MUST be
  // detected as a graph-side change on the endpoint nodes. We treat this as an
  // implicit spec requirement rather than an override.
  //
  // Rule: for each edge that was added, removed, or had its endpoints changed,
  // mark both source.nodeId and target.nodeId as graph-changed.

  const prevEdgeMap = new Map(prevSnapshot.graph.edges.map(e => [e.id, e]));
  const currEdgeMap = new Map(currentGraph.edges.map(e => [e.id, e]));

  // Edges in current but not in prev (added), or with changed endpoints (rewired)
  for (const [edgeId, currEdge] of currEdgeMap) {
    const prevEdge = prevEdgeMap.get(edgeId);
    if (!prevEdge) {
      // Added edge — both endpoints are affected
      graphChangedNodeIds.push(currEdge.source.nodeId, currEdge.target.nodeId);
    } else if (
      prevEdge.source.nodeId !== currEdge.source.nodeId ||
      prevEdge.source.portId !== currEdge.source.portId ||
      prevEdge.target.nodeId !== currEdge.target.nodeId ||
      prevEdge.target.portId !== currEdge.target.portId
    ) {
      // Rewired edge — old and new endpoints are all affected
      graphChangedNodeIds.push(
        prevEdge.source.nodeId, prevEdge.target.nodeId,
        currEdge.source.nodeId, currEdge.target.nodeId
      );
    }
  }

  // Edges in prev but not in current (removed)
  for (const [edgeId, prevEdge] of prevEdgeMap) {
    if (!currEdgeMap.has(edgeId)) {
      graphChangedNodeIds.push(prevEdge.source.nodeId, prevEdge.target.nodeId);
    }
  }

  // 2. Compute codeChangedSymbols
  const codeChangedSymbols: string[] = [];
  const project = createProject();
  const sourceFile = createSourceFile(project, currentCode);

  const statements = sourceFile.getStatements();
  const currentSymbols = new Set<string>();

  for (const stmt of statements) {
    const kindTag = getGraphLoomKind(stmt);
    if (!kindTag) continue;

    let symbol = "";
    if (Node.isVariableStatement(stmt)) {
      symbol = stmt.getDeclarations()[0]?.getName() ?? "";
    } else if (Node.isFunctionDeclaration(stmt)) {
      symbol = stmt.getName() ?? "";
    }

    if (symbol) {
      currentSymbols.add(symbol);
      const span = getBlockSpan(stmt);
      const currentText = currentCode.substring(span.start, span.end).trim();

      // Find original text in prevSnapshot
      const matchingNodeId = prevSnapshot.mapping.astToNode[symbol];
      if (matchingNodeId) {
        const origAstRef = prevSnapshot.mapping.nodeToAst[matchingNodeId];
        if (origAstRef) {
          const originalText = prevSnapshot.code.substring(origAstRef.start, origAstRef.end).trim();
          if (currentText !== originalText) {
            codeChangedSymbols.push(symbol);
          }
        } else {
          codeChangedSymbols.push(symbol);
        }
      } else {
        // New symbol in code
        codeChangedSymbols.push(symbol);
      }
    }
  }

  // Check for deleted symbols in code
  for (const prevSymbol of Object.keys(prevSnapshot.mapping.astToNode)) {
    if (!currentSymbols.has(prevSymbol)) {
      codeChangedSymbols.push(prevSymbol);
    }
  }

  const uniqueGraphChanged = Array.from(new Set(graphChangedNodeIds));
  const uniqueCodeChanged = Array.from(new Set(codeChangedSymbols));

  const hasGraphChanges = uniqueGraphChanged.length > 0;
  const hasCodeChanges = uniqueCodeChanged.length > 0;

  if (!hasGraphChanges && !hasCodeChanges) {
    return { status: "clean" };
  }

  if (hasGraphChanges && !hasCodeChanges) {
    return { status: "graph-ahead", changedNodeIds: uniqueGraphChanged };
  }

  if (!hasGraphChanges && hasCodeChanges) {
    return { status: "code-ahead", changedSymbols: uniqueCodeChanged };
  }

  // Both have changed — check intersection of node IDs
  const codeChangedNodeIds = uniqueCodeChanged
    .map(sym => prevSnapshot.mapping.astToNode[sym])
    .filter(Boolean);

  const intersection = uniqueGraphChanged.filter(id => codeChangedNodeIds.includes(id));

  if (intersection.length > 0) {
    // True conflict: at least one node was edited on both sides.
    // Carry the FULL changed sets so the caller can see everything,
    // with the overlap derivable via intersection.
    return {
      status: "conflict",
      graphChangedNodeIds: uniqueGraphChanged,
      codeChangedSymbols: uniqueCodeChanged,
    };
  }

  // Disjoint changes: both sides changed, but on completely separate nodes.
  // Per CONFLICT_DETECTION.md §2: "A node id in only one set is a clean,
  // safe, one-directional update." — this is NOT a conflict.
  return {
    status: "both-ahead",
    graphChangedNodeIds: uniqueGraphChanged,
    codeChangedSymbols: uniqueCodeChanged,
  };
}
