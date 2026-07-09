/**
 * roundtrip tests — Day 2 per IMPLEMENTATION_PLAN.md
 *
 * Validates the entire product thesis:
 * graph -> code -> graph preserves structural equality (ignoring node positions).
 *
 * Uses:
 * 1. Day 1 linear fixture (input → fetch → transform → output)
 * 2. Fan-out/fan-in fixture (input → two transforms → merge → output)
 */

import { describe, it, expect } from "vitest";
import { graphToCode } from "../src/graphToCode.js";
import { codeToGraph } from "../src/codeToGraph.js";
import { createInputNode } from "../src/nodeKinds/input.js";
import { createFetchNode } from "../src/nodeKinds/fetch.js";
import { createTransformNode } from "../src/nodeKinds/transform.js";
import { createOutputNode } from "../src/nodeKinds/output.js";
import type { Graph, GraphNode, GraphEdge } from "../src/types.js";

/**
 * Asserts structural equality between two graphs (ignoring positions)
 */
function expectGraphsEqual(actual: Graph, expected: Graph) {
  expect(actual.nodes.length).toBe(expected.nodes.length);
  expect(actual.edges.length).toBe(expected.edges.length);

  // Compare nodes sorted by ID
  const sortedActualNodes = [...actual.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedExpectedNodes = [...expected.nodes].sort((a, b) => a.id.localeCompare(b.id));

  sortedActualNodes.forEach((actNode, i) => {
    const expNode = sortedExpectedNodes[i];
    expect(actNode.id).toBe(expNode.id);
    expect(actNode.kind).toBe(expNode.kind);
    expect(actNode.label).toBe(expNode.label);
    
    // Compare inputs
    expect(actNode.inputs.length).toBe(expNode.inputs.length);
    actNode.inputs.forEach((inp, idx) => {
      expect(inp.name).toBe(expNode.inputs[idx].name);
      expect(inp.type).toBe(expNode.inputs[idx].type);
    });

    // Compare outputs
    expect(actNode.outputs.length).toBe(expNode.outputs.length);
    actNode.outputs.forEach((out, idx) => {
      expect(out.name).toBe(expNode.outputs[idx].name);
      expect(out.type).toBe(expNode.outputs[idx].type);
    });

    // Compare configs
    expect(actNode.config).toEqual(expNode.config);
  });

  // Compare edges (reconstructing/matching source and target)
  const actEdges = actual.edges.map(e => `${e.source.nodeId}:${e.source.portId}->${e.target.nodeId}:${e.target.portId}`).sort();
  const expEdges = expected.edges.map(e => `${e.source.nodeId}:${e.source.portId}->${e.target.nodeId}:${e.target.portId}`).sort();
  
  expect(actEdges).toEqual(expEdges);
}

function createLinearGraph(): Graph {
  const inputNode = createInputNode({
    id: "node-1",
    label: "userQuery",
    outputType: "string",
    defaultValue: "test query",
  });

  const fetchNode = createFetchNode({
    id: "node-2",
    label: "fetchResults",
    inputs: [{ name: "query", type: "string" }],
    outputType: "array",
    urlTemplate: "/api/search?q=${query}",
    method: "GET",
  });

  const transformNode = createTransformNode({
    id: "node-3",
    label: "rankResults",
    inputs: [{ name: "results", type: "array" }],
    outputType: "array",
    body: "return results.slice(0, 10);",
  });

  const outputNode = createOutputNode({
    id: "node-4",
    label: "output",
    inputType: "array",
  });

  const edges: GraphEdge[] = [
    {
      id: "edge-1",
      source: { nodeId: "node-1", portId: "node-1_out" },
      target: { nodeId: "node-2", portId: "node-2_in_0" },
    },
    {
      id: "edge-2",
      source: { nodeId: "node-2", portId: "node-2_out" },
      target: { nodeId: "node-3", portId: "node-3_in_0" },
    },
    {
      id: "edge-3",
      source: { nodeId: "node-3", portId: "node-3_out" },
      target: { nodeId: "node-4", portId: "node-4_in" },
    },
  ];

  return {
    id: "linear-graph",
    nodes: [inputNode, fetchNode, transformNode, outputNode],
    edges,
    version: 1,
  };
}

function createFanOutFanInGraph(): Graph {
  const inputNode = createInputNode({
    id: "node-1",
    label: "userQuery",
    outputType: "string",
    defaultValue: "hello",
  });

  const upperNode = createTransformNode({
    id: "node-2",
    label: "upperCase",
    inputs: [{ name: "query", type: "string" }],
    outputType: "string",
    body: "return query.toUpperCase();",
  });

  const lowerNode = createTransformNode({
    id: "node-3",
    label: "lowerCase",
    inputs: [{ name: "query", type: "string" }],
    outputType: "string",
    body: "return query.toLowerCase();",
  });

  const mergeNode = createTransformNode({
    id: "node-4",
    label: "merge",
    inputs: [
      { name: "upper", type: "string" },
      { name: "lower", type: "string" },
    ],
    outputType: "object",
    body: "return { upper, lower };",
  });

  const outputNode = createOutputNode({
    id: "node-5",
    label: "output",
    inputType: "object",
  });

  const edges: GraphEdge[] = [
    {
      id: "edge-1",
      source: { nodeId: "node-1", portId: "node-1_out" },
      target: { nodeId: "node-2", portId: "node-2_in_0" },
    },
    {
      id: "edge-2",
      source: { nodeId: "node-1", portId: "node-1_out" },
      target: { nodeId: "node-3", portId: "node-3_in_0" },
    },
    {
      id: "edge-3",
      source: { nodeId: "node-2", portId: "node-2_out" },
      target: { nodeId: "node-4", portId: "node-4_in_0" },
    },
    {
      id: "edge-4",
      source: { nodeId: "node-3", portId: "node-3_out" },
      target: { nodeId: "node-4", portId: "node-4_in_1" },
    },
    {
      id: "edge-5",
      source: { nodeId: "node-4", portId: "node-4_out" },
      target: { nodeId: "node-5", portId: "node-5_in" },
    },
  ];

  return {
    id: "fanout-fanin-graph",
    nodes: [inputNode, upperNode, lowerNode, mergeNode, outputNode],
    edges,
    version: 1,
  };
}

describe("round-trip fidelity", () => {
  it("graph -> code -> graph preserves linear fixture structure (with snapshot ID preservation)", () => {
    const original = createLinearGraph();
    
    // Graph -> Code
    const { code, mapping } = graphToCode(original);

    const snapshot = {
      graphVersion: original.version,
      codeHash: "hash",
      code,
      graph: original,
      mapping,
      timestamp: Date.now(),
    };
    
    // Code -> Graph with snapshot
    const { graph: parsed } = codeToGraph(code, snapshot);
    
    expectGraphsEqual(parsed, original);
  });

  it("graph -> code -> graph preserves fan-out/fan-in fixture structure (with snapshot ID preservation)", () => {
    const original = createFanOutFanInGraph();
    
    // Graph -> Code
    const { code, mapping } = graphToCode(original);

    const snapshot = {
      graphVersion: original.version,
      codeHash: "hash",
      code,
      graph: original,
      mapping,
      timestamp: Date.now(),
    };
    
    // Code -> Graph with snapshot
    const { graph: parsed } = codeToGraph(code, snapshot);
    
    expectGraphsEqual(parsed, original);
  });

  it("code -> graph -> code produces identical code (first sync, no snapshot)", () => {
    const original = createLinearGraph();
    const { code: originalCode } = graphToCode(original);

    // Parse code without snapshot (will generate node-userQuery, etc. as IDs)
    const { graph: parsed } = codeToGraph(originalCode);

    // Regenerate code from parsed graph
    const { code: regeneratedCode } = graphToCode(parsed);

    expect(regeneratedCode).toBe(originalCode);
  });

  it("code -> graph -> code produces identical code for fan-out/fan-in (first sync, no snapshot)", () => {
    const original = createFanOutFanInGraph();
    const { code: originalCode } = graphToCode(original);

    // Parse code without snapshot
    const { graph: parsed } = codeToGraph(originalCode);

    // Regenerate code from parsed graph
    const { code: regeneratedCode } = graphToCode(parsed);

    expect(regeneratedCode).toBe(originalCode);
  });

  it("reconstructs correct Graph mapping and maintains ID stability", () => {
    const original = createLinearGraph();
    const { code, mapping: originalMapping } = graphToCode(original);

    // Create a mock snapshot to enforce ID stability
    const mockSnapshot = {
      graphVersion: 1,
      codeHash: "hash",
      code,
      graph: original,
      mapping: originalMapping,
      timestamp: Date.now(),
    };

    const { graph: parsed, mapping: parsedMapping } = codeToGraph(code, mockSnapshot);

    // Expect node IDs to be identical to original IDs
    parsed.nodes.forEach(node => {
      const origNode = original.nodes.find(n => n.label === node.label);
      expect(origNode).toBeDefined();
      expect(node.id).toBe(origNode!.id);
    });

    // Check mapping integrity
    expect(parsedMapping.astToNode["userQuery"]).toBe("node-1");
    expect(parsedMapping.astToNode["fetchResults"]).toBe("node-2");
    expect(parsedMapping.astToNode["rankResults"]).toBe("node-3");
    expect(parsedMapping.astToNode["output"]).toBe("node-4");
  });

  it("preserves hand-added comment inside a node's function declaration across unrelated graph-driven regeneration", () => {
    const original = createLinearGraph();
    const { code: originalCode, mapping: originalMapping } = graphToCode(original);

    // Hand-add a comment inside the rankResults transform body
    const commentedCode = originalCode.replace(
      "return results.slice(0, 10);",
      "// HAND-ADDED COMMENT\n  return results.slice(0, 10);"
    );

    // Snapshot of the initial state
    const snapshot = {
      graphVersion: 1,
      codeHash: "hash-1",
      code: commentedCode,
      graph: original,
      mapping: originalMapping,
      timestamp: Date.now(),
    };

    // Feed back into codeToGraph to map the commented code properly
    const { graph: parsedGraph, mapping: parsedMapping } = codeToGraph(commentedCode, snapshot);

    // Now, perform an unrelated graph change: edit the input node's defaultValue config
    const modifiedGraph = JSON.parse(JSON.stringify(parsedGraph)) as Graph;
    const inputNode = modifiedGraph.nodes.find(n => n.kind === "input")!;
    inputNode.config.defaultValue = "new query value";

    // Regenerate code passing the snapshot of commented state
    const commentedSnapshot = {
      graphVersion: 1,
      codeHash: "hash-commented",
      code: commentedCode,
      graph: parsedGraph,
      mapping: parsedMapping,
      timestamp: Date.now(),
    };

    const { code: regeneratedCode } = graphToCode(modifiedGraph, commentedSnapshot);

    // Assert that the unrelated graph change is present
    expect(regeneratedCode).toContain('"new query value"');

    // Assert that the hand-added comment survived!
    expect(regeneratedCode).toContain("// HAND-ADDED COMMENT");
  });
});
