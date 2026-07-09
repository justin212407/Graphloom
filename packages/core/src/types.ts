/**
 * GraphLoom Core Types
 *
 * Exact shapes per docs/DATA_MODEL.md — do not simplify or modify
 * without explicit approval.
 */

// === §1. Core types ===

export type PortType = "string" | "number" | "boolean" | "object" | "array" | "any";

export interface Port {
  id: string;
  name: string;
  type: PortType;
}

export type NodeKind = "input" | "fetch" | "transform" | "output";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  inputs: Port[];
  outputs: Port[];
  /** Node-specific config, e.g. the transform function body, the fetch URL template */
  config: Record<string, unknown>;
  /** Position is UI concern but travels with the node for round-trip fidelity */
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: { nodeId: string; portId: string };
  target: { nodeId: string; portId: string };
}

export interface Graph {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Monotonic version, bumped on every structural change, used by drift detection */
  version: number;
}

// === §2. Code-side representation ===

export interface AstRef {
  /** identifier used in generated code, e.g. the function/variable name */
  symbol: string;
  /** source span, used to patch in place instead of full regeneration */
  start: number;
  end: number;
}

export interface CodeMapping {
  /** graph node id -> AST node reference (e.g. function name + span) */
  nodeToAst: Record<string, AstRef>;
  /** AST node reference -> graph node id, for the reverse direction */
  astToNode: Record<string, string>;
}

// === §3. Sync metadata (drift detection) ===

export interface SyncSnapshot {
  graphVersion: number;
  /** hash of the generated code at last sync, not the live editor content */
  codeHash: string;
  code: string;
  graph: Graph;
  mapping: CodeMapping;
  timestamp: number;
}

export type DriftResult =
  | { status: "clean" }
  | { status: "graph-ahead"; changedNodeIds: string[] }
  | { status: "code-ahead"; changedSymbols: string[] }
  | {
      /**
       * Both sides changed on completely disjoint nodes — each side's changes
       * are independently safe to apply. Not a conflict per CONFLICT_DETECTION.md §2:
       * "A node id in only one set is a clean, safe, one-directional update."
       *
       * NOTE: This status is an extension beyond the original four-state union in
       * data_model.md §3, which had no representation for this case. Added to avoid
       * falsely treating disjoint edits as conflicts.
       */
      status: "both-ahead";
      graphChangedNodeIds: string[];
      codeChangedSymbols: string[];
    }
  | {
      /**
       * True conflict: at least one node id appears in BOTH the graph-changed set
       * and the code-changed set. Only the intersecting node ids are genuine conflicts;
       * non-overlapping changes from either side are safe.
       *
       * graphChangedNodeIds / codeChangedSymbols carry the FULL changed sets (not just
       * the intersection), so the caller can see everything that moved, with the overlap
       * derivable via intersection.
       */
      status: "conflict";
      graphChangedNodeIds: string[];
      codeChangedSymbols: string[];
    };

// === §4. Node vocabulary config shapes (v1) ===

/** InputNode.config */
export interface InputNodeConfig {
  defaultValue?: unknown;
}

/** FetchNode.config */
export interface FetchNodeConfig {
  urlTemplate: string;
  method: "GET" | "POST";
}

/** TransformNode.config */
export interface TransformNodeConfig {
  /** a pure JS expression/function body, patched in place on edit */
  body: string;
}

/** OutputNode.config — terminal, no config */
export interface OutputNodeConfig {
  // intentionally empty
}
