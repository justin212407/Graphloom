/**
 * @graphloom/core — public API surface
 *
 * Framework-agnostic. No React Flow, no Monaco.
 */

// Core types
export type {
  PortType,
  Port,
  NodeKind,
  GraphNode,
  GraphEdge,
  Graph,
  AstRef,
  CodeMapping,
  SyncSnapshot,
  DriftResult,
  InputNodeConfig,
  FetchNodeConfig,
  TransformNodeConfig,
  OutputNodeConfig,
} from "./types.js";

// Graph → Code
export { graphToCode } from "./graphToCode.js";
export type { GraphToCodeResult } from "./graphToCode.js";

// Code → Graph (Day 2 stub)
// export { codeToGraph } from "./codeToGraph.js";

// Drift detection (Day 2 stub)
// export { detectDrift } from "./detectDrift.js";

// Conflict resolution (Day 2 stub)
// export { resolveConflict } from "./resolveConflict.js";

// Node kind utilities
export {
  validateInputNode,
  createInputNode,
} from "./nodeKinds/input.js";
export {
  validateFetchNode,
  createFetchNode,
} from "./nodeKinds/fetch.js";
export {
  validateTransformNode,
  createTransformNode,
} from "./nodeKinds/transform.js";
export {
  validateOutputNode,
  createOutputNode,
} from "./nodeKinds/output.js";

// AST utilities
export {
  hashCode,
  topologicalSort,
  portTypeToTS,
  tsToPortType,
} from "./astUtils.js";
