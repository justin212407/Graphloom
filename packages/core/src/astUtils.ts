/**
 * AST Utilities — ts-morph wrappers and hashing helpers
 *
 * Provides the load-bearing AST operations for graphToCode/codeToGraph.
 * Uses ts-morph for structural code generation/parsing that preserves
 * formatting and comments.
 */

import { Project, SourceFile, SyntaxKind, IndentationText, NewLineKind } from "ts-morph";
import type { PortType } from "./types.js";

/**
 * Creates a ts-morph Project configured for in-memory source file manipulation.
 * No filesystem access — everything is virtual.
 */
export function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
      module: 99,  // ESNext
      strict: true,
    },
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
    },
  });
}

/**
 * Creates a virtual source file from code string.
 */
export function createSourceFile(project: Project, code: string, fileName?: string): SourceFile {
  return project.createSourceFile(fileName ?? "pipeline.ts", code, { overwrite: true });
}

/**
 * Prints a source file back to a string.
 */
export function printSourceFile(sourceFile: SourceFile): string {
  return sourceFile.getFullText();
}

/**
 * Maps a PortType to a TypeScript type annotation string.
 */
export function portTypeToTS(type: PortType): string {
  switch (type) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "object": return "Record<string, unknown>";
    case "array": return "unknown[]";
    case "any": return "any";
  }
}

/**
 * Maps a TypeScript type string back to a PortType.
 * Falls back to "any" for unrecognized types (with warning, not error).
 */
export function tsToPortType(tsType: string): { type: PortType; warning?: string } {
  const normalized = tsType.trim();
  switch (normalized) {
    case "string": return { type: "string" };
    case "number": return { type: "number" };
    case "boolean": return { type: "boolean" };
    case "Record<string, unknown>":
    case "object":
      return { type: "object" };
    case "unknown[]":
    case "any[]":
    case "Array<unknown>":
    case "Array<any>":
      return { type: "array" };
    case "any": return { type: "any" };
    default:
      return { type: "any", warning: `Unrecognized type "${normalized}", falling back to "any"` };
  }
}

/**
 * Simple string hash for drift detection.
 * Uses a fast non-crypto hash — good enough for comparing code snapshots.
 */
export function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0; // Convert to 32bit integer
  }
  // Return as hex string with sign handling
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Performs a topological sort on graph nodes based on edges.
 * Returns node IDs in dependency order (sources first).
 * Throws on cyclic graphs per EDGE_CASES.md — "reject at validation time with a clear error".
 */
export function topologicalSort(
  nodeIds: string[],
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Build adjacency and count in-degrees
  for (const edge of edges) {
    const targets = adjacency.get(edge.source.nodeId);
    if (targets) {
      targets.push(edge.target.nodeId);
    }
    inDegree.set(edge.target.nodeId, (inDegree.get(edge.target.nodeId) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodeIds.length) {
    const unsorted = nodeIds.filter(id => !sorted.includes(id));
    throw new Error(
      `Cyclic graph detected: nodes [${unsorted.join(", ")}] form a cycle. ` +
      `A valid pipeline must have a clear execution order.`
    );
  }

  return sorted;
}
