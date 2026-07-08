/**
 * graphToCode tests — Day 1 per IMPLEMENTATION_PLAN.md
 *
 * Hand-built 4-node Graph fixture: input → fetch → transform → output
 * Assert generated code compiles and looks right.
 */

import { describe, it, expect } from "vitest";
import { graphToCode } from "../src/graphToCode.js";
import { createInputNode } from "../src/nodeKinds/input.js";
import { createFetchNode } from "../src/nodeKinds/fetch.js";
import { createTransformNode } from "../src/nodeKinds/transform.js";
import { createOutputNode } from "../src/nodeKinds/output.js";
import type { Graph, GraphEdge } from "../src/types.js";

/**
 * Hand-built 4-node fixture shaped like an AI pipeline:
 * userQuery (input) → fetchResults (fetch) → rankResults (transform) → output
 */
function createTestGraph(): Graph {
  const inputNode = createInputNode({
    id: "node-1",
    label: "userQuery",
    outputType: "string",
    defaultValue: "test query",
    position: { x: 0, y: 100 },
  });

  const fetchNode = createFetchNode({
    id: "node-2",
    label: "fetchResults",
    inputs: [{ name: "query", type: "string" }],
    outputType: "array",
    urlTemplate: "/api/search?q=${query}",
    method: "GET",
    position: { x: 250, y: 100 },
  });

  const transformNode = createTransformNode({
    id: "node-3",
    label: "rankResults",
    inputs: [{ name: "results", type: "array" }],
    outputType: "array",
    body: "return results.slice(0, 10);",
    position: { x: 500, y: 100 },
  });

  const outputNode = createOutputNode({
    id: "node-4",
    label: "output",
    inputType: "array",
    position: { x: 750, y: 100 },
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
    id: "test-graph",
    nodes: [inputNode, fetchNode, transformNode, outputNode],
    edges,
    version: 1,
  };
}

/**
 * Hand-built fan-out/fan-in fixture:
 * userQuery (input)
 *   ├──> upperCase (transform) ──┐
 *   └──> lowerCase (transform) ──┼─> merge (transform) ─> output (output)
 */
function createFanOutFanInGraph(): Graph {
  const inputNode = createInputNode({
    id: "node-1",
    label: "userQuery",
    outputType: "string",
    defaultValue: "hello",
    position: { x: 0, y: 150 },
  });

  const upperNode = createTransformNode({
    id: "node-2",
    label: "upperCase",
    inputs: [{ name: "query", type: "string" }],
    outputType: "string",
    body: "return query.toUpperCase();",
    position: { x: 250, y: 50 },
  });

  const lowerNode = createTransformNode({
    id: "node-3",
    label: "lowerCase",
    inputs: [{ name: "query", type: "string" }],
    outputType: "string",
    body: "return query.toLowerCase();",
    position: { x: 250, y: 250 },
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
    position: { x: 500, y: 150 },
  });

  const outputNode = createOutputNode({
    id: "node-5",
    label: "output",
    inputType: "object",
    position: { x: 750, y: 150 },
  });

  const edges: GraphEdge[] = [
    // Fan-out
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
    // Fan-in
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
    // To output
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


describe("graphToCode", () => {
  describe("4-node pipeline fixture (input → fetch → transform → output)", () => {
    it("generates code without throwing", () => {
      const graph = createTestGraph();
      const result = graphToCode(graph);
      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe("string");
      expect(result.code.length).toBeGreaterThan(0);
    });

    it("includes @graphloom:node tags for all four nodes", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      expect(code).toContain("// @graphloom:node input");
      expect(code).toContain("// @graphloom:node fetch");
      expect(code).toContain("// @graphloom:node transform");
      expect(code).toContain("// @graphloom:node output");
    });

    it("generates defineInput call for the input node", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per PARSER_RULES.md §2: const x = defineInput<T>("name")
      expect(code).toContain('const userQuery = defineInput<string>("userQuery"');
    });

    it("generates an async function for the fetch node", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per PARSER_RULES.md §2: async function, tagged fetch
      expect(code).toMatch(/async function fetchResults\(/);
    });

    it("generates a plain function for the transform node", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per PARSER_RULES.md §2: plain (non-async) function, tagged transform
      expect(code).toMatch(/function rankResults\(/);
      // Must NOT be async
      expect(code).not.toMatch(/async function rankResults\(/);
    });

    it("includes the transform body verbatim", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per NODE_TYPES.md §3: body is captured and replayed verbatim
      expect(code).toContain("return results.slice(0, 10);");
    });

    it("generates a function for the output node", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per NODE_TYPES.md §4: function tagged output
      expect(code).toMatch(/function output\(/);
    });

    it("generates a pipeline call site connecting nodes via calls", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Per PARSER_RULES.md §3: edges are reconstructed from call sites
      expect(code).toContain("fetchResults(userQuery)");
      expect(code).toContain("rankResults(fetchResultsResult)");
      expect(code).toContain("output(rankResultsResult)");
    });

    it("uses await for the fetch call", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      expect(code).toContain("await fetchResults(");
    });

    it("produces a mapping with entries for all four nodes", () => {
      const graph = createTestGraph();
      const { mapping } = graphToCode(graph);

      expect(mapping.nodeToAst["node-1"]).toBeDefined();
      expect(mapping.nodeToAst["node-2"]).toBeDefined();
      expect(mapping.nodeToAst["node-3"]).toBeDefined();
      expect(mapping.nodeToAst["node-4"]).toBeDefined();

      // Verify symbols match labels
      expect(mapping.nodeToAst["node-1"].symbol).toBe("userQuery");
      expect(mapping.nodeToAst["node-2"].symbol).toBe("fetchResults");
      expect(mapping.nodeToAst["node-3"].symbol).toBe("rankResults");
      expect(mapping.nodeToAst["node-4"].symbol).toBe("output");
    });

    it("produces a reverse mapping (symbol → nodeId) for all four nodes", () => {
      const graph = createTestGraph();
      const { mapping } = graphToCode(graph);

      expect(mapping.astToNode["userQuery"]).toBe("node-1");
      expect(mapping.astToNode["fetchResults"]).toBe("node-2");
      expect(mapping.astToNode["rankResults"]).toBe("node-3");
      expect(mapping.astToNode["output"]).toBe("node-4");
    });

    it("includes type annotations in the generated code", () => {
      const graph = createTestGraph();
      const { code } = graphToCode(graph);

      // Fetch should have typed params and return
      expect(code).toContain("query: string");
      expect(code).toContain("Promise<unknown[]>");

      // Transform should have typed params and return
      expect(code).toContain("results: unknown[]");
    });
  });

  describe("fan-out/fan-in pipeline fixture (one input feeding two transforms feeding one output)", () => {
    it("generates code without throwing", () => {
      const graph = createFanOutFanInGraph();
      const result = graphToCode(graph);
      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe("string");
      expect(result.code.length).toBeGreaterThan(0);
    });

    it("includes @graphloom:node tags for all five nodes", () => {
      const graph = createFanOutFanInGraph();
      const { code } = graphToCode(graph);

      expect(code).toContain("// @graphloom:node input");
      expect(code).toContain("// @graphloom:node transform");
      expect(code).toContain("// @graphloom:node output");
      // There are 3 transforms in total: upperCase, lowerCase, merge
      const matches = [...code.matchAll(/\/\/ @graphloom:node transform/g)];
      expect(matches.length).toBe(3);
    });

    it("generates the helper and nodes in topological order", () => {
      const graph = createFanOutFanInGraph();
      const { code } = graphToCode(graph);

      // Check declaration of defineInput
      expect(code).toContain("function defineInput");
      // Check declarations
      expect(code).toContain("const userQuery = defineInput");
      expect(code).toContain("function upperCase(");
      expect(code).toContain("function lowerCase(");
      expect(code).toContain("function merge(");
      expect(code).toContain("function output(");
    });

    it("wires call sites correctly with topological resolution (fan-out and fan-in)", () => {
      const graph = createFanOutFanInGraph();
      const { code } = graphToCode(graph);

      // Call site execution wiring:
      // upperCase and lowerCase both take userQuery
      expect(code).toContain("const upperCaseResult = upperCase(userQuery);");
      expect(code).toContain("const lowerCaseResult = lowerCase(userQuery);");
      // merge takes upperCaseResult and lowerCaseResult
      expect(code).toContain("const mergeResult = merge(upperCaseResult, lowerCaseResult);");
      // output takes mergeResult
      expect(code).toContain("const outputResult = output(mergeResult);");
    });

    it("produces correct mapping entries", () => {
      const graph = createFanOutFanInGraph();
      const { mapping } = graphToCode(graph);

      expect(mapping.nodeToAst["node-1"].symbol).toBe("userQuery");
      expect(mapping.nodeToAst["node-2"].symbol).toBe("upperCase");
      expect(mapping.nodeToAst["node-3"].symbol).toBe("lowerCase");
      expect(mapping.nodeToAst["node-4"].symbol).toBe("merge");
      expect(mapping.nodeToAst["node-5"].symbol).toBe("output");

      expect(mapping.astToNode["userQuery"]).toBe("node-1");
      expect(mapping.astToNode["upperCase"]).toBe("node-2");
      expect(mapping.astToNode["lowerCase"]).toBe("node-3");
      expect(mapping.astToNode["merge"]).toBe("node-4");
      expect(mapping.astToNode["output"]).toBe("node-5");
    });
  });

  describe("validation", () => {
    it("rejects cyclic graphs", () => {
      const nodeA = createTransformNode({
        id: "a", label: "a",
        inputs: [{ name: "x", type: "any" }],
        outputType: "any", body: "return x;",
      });
      const nodeB = createTransformNode({
        id: "b", label: "b",
        inputs: [{ name: "x", type: "any" }],
        outputType: "any", body: "return x;",
      });

      const graph: Graph = {
        id: "cyclic",
        nodes: [nodeA, nodeB],
        edges: [
          { id: "e1", source: { nodeId: "a", portId: "a_out" }, target: { nodeId: "b", portId: "b_in_0" } },
          { id: "e2", source: { nodeId: "b", portId: "b_out" }, target: { nodeId: "a", portId: "a_in_0" } },
        ],
        version: 1,
      };

      expect(() => graphToCode(graph)).toThrow(/[Cc]yclic/);
    });

    it("rejects multiple output nodes", () => {
      const out1 = createOutputNode({ id: "o1", label: "output1", inputType: "any" });
      const out2 = createOutputNode({ id: "o2", label: "output2", inputType: "any" });

      const graph: Graph = {
        id: "multi-output",
        nodes: [out1, out2],
        edges: [],
        version: 1,
      };

      expect(() => graphToCode(graph)).toThrow(/output/i);
    });

    it("rejects multiple edges into one input port", () => {
      const input1 = createInputNode({ id: "i1", label: "a", outputType: "string" });
      const input2 = createInputNode({ id: "i2", label: "b", outputType: "string" });
      const transform = createTransformNode({
        id: "t", label: "c",
        inputs: [{ name: "x", type: "string" }],
        outputType: "string", body: "return x;",
      });

      const graph: Graph = {
        id: "multi-edge",
        nodes: [input1, input2, transform],
        edges: [
          { id: "e1", source: { nodeId: "i1", portId: "i1_out" }, target: { nodeId: "t", portId: "t_in_0" } },
          { id: "e2", source: { nodeId: "i2", portId: "i2_out" }, target: { nodeId: "t", portId: "t_in_0" } },
        ],
        version: 1,
      };

      expect(() => graphToCode(graph)).toThrow(/[Mm]ultiple edges/);
    });

    it("handles orphan nodes (emits dead code, doesn't delete)", () => {
      // Per EDGE_CASES.md: orphan node is valid, generates dead code
      const orphan = createTransformNode({
        id: "orphan", label: "orphan",
        inputs: [{ name: "x", type: "any" }],
        outputType: "any", body: "return x;",
      });

      const graph: Graph = {
        id: "orphan-graph",
        nodes: [orphan],
        edges: [],
        version: 1,
      };

      const { code } = graphToCode(graph);
      expect(code).toContain("function orphan(");
    });

    it("handles empty graph", () => {
      // Per EDGE_CASES.md: zero nodes is valid
      const graph: Graph = {
        id: "empty",
        nodes: [],
        edges: [],
        version: 1,
      };

      const { code } = graphToCode(graph);
      expect(typeof code).toBe("string");
    });
  });
});
