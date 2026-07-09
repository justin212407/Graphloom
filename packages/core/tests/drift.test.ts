/**
 * drift detection tests — Day 2 per IMPLEMENTATION_PLAN.md
 */

import { describe, it, expect } from "vitest";
import { detectDrift } from "../src/detectDrift.js";
import { resolveConflict } from "../src/resolveConflict.js";
import { graphToCode } from "../src/graphToCode.js";
import { codeToGraph } from "../src/codeToGraph.js";
import { createInputNode } from "../src/nodeKinds/input.js";
import { createTransformNode } from "../src/nodeKinds/transform.js";
import { createOutputNode } from "../src/nodeKinds/output.js";
import { hashCode } from "../src/astUtils.js";
import type { Graph, SyncSnapshot } from "../src/types.js";

function createBaseGraph(): Graph {
  const input = createInputNode({ id: "node-1", label: "query", outputType: "string", defaultValue: "hello" });
  const transform = createTransformNode({
    id: "node-2", label: "upperCase",
    inputs: [{ name: "query", type: "string" }], outputType: "string",
    body: "return query.toUpperCase();"
  });
  const output = createOutputNode({ id: "node-3", label: "output", inputType: "string" });

  return {
    id: "drift-test-graph",
    nodes: [input, transform, output],
    edges: [
      { id: "e1", source: { nodeId: "node-1", portId: "node-1_out" }, target: { nodeId: "node-2", portId: "node-2_in_0" } },
      { id: "e2", source: { nodeId: "node-2", portId: "node-2_out" }, target: { nodeId: "node-3", portId: "node-3_in" } },
    ],
    version: 1,
  };
}

function createSnapshot(graph: Graph): SyncSnapshot {
  const { code, mapping } = graphToCode(graph);
  return {
    graphVersion: graph.version,
    codeHash: hashCode(code),
    code,
    graph,
    mapping,
    timestamp: Date.now(),
  };
}

describe("detectDrift & resolveConflict tests", () => {
  it("returns clean when nothing changed", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);
    
    const result = detectDrift(graph, snapshot.code, snapshot);
    expect(result.status).toBe("clean");
  });

  it("returns graph-ahead when only graph changed", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);

    // Edit transform node config on graph side
    const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
    modifiedGraph.version = 2;
    modifiedGraph.nodes[1].config.body = "return query + '!!!';";

    const result = detectDrift(modifiedGraph, snapshot.code, snapshot);
    expect(result.status).toBe("graph-ahead");
    if (result.status === "graph-ahead") {
      expect(result.changedNodeIds).toContain("node-2");
    }
  });

  it("returns code-ahead when only code changed", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);

    // Edit code directly in the transform body
    const modifiedCode = snapshot.code.replace(
      "return query.toUpperCase();",
      "return query.toUpperCase() + '?';"
    );

    const result = detectDrift(graph, modifiedCode, snapshot);
    expect(result.status).toBe("code-ahead");
    if (result.status === "code-ahead") {
      expect(result.changedSymbols).toContain("upperCase");
    }
  });

  it("returns conflict when both changed (overlapping node changes)", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);

    // 1. Edit graph-side config of node-2
    const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
    modifiedGraph.version = 2;
    modifiedGraph.nodes[1].config.body = "return query.trim();";

    // 2. Edit code-side of same node-2
    const modifiedCode = snapshot.code.replace(
      "return query.toUpperCase();",
      "return query.toLowerCase();"
    );

    const result = detectDrift(modifiedGraph, modifiedCode, snapshot);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.graphChangedNodeIds).toContain("node-2");
      expect(result.codeChangedSymbols).toContain("upperCase");
    }
  });

  it("resolves conflict keeping graph changes only", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);

    const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
    modifiedGraph.version = 2;
    modifiedGraph.nodes[1].config.body = "return query.trim();";

    const modifiedCode = snapshot.code.replace(
      "return query.toUpperCase();",
      "return query.toLowerCase();"
    );

    // Resolve keeping graph
    const resolvedSnapshot = resolveConflict("node-2", "graph", modifiedGraph, modifiedCode, snapshot);

    // The snapshot should contain the graph's body and version
    expect(resolvedSnapshot.graph.nodes[1].config.body).toBe("return query.trim();");
    expect(resolvedSnapshot.code).toContain("return query.trim();");
  });

  it("resolves conflict keeping code changes only", () => {
    const graph = createBaseGraph();
    const snapshot = createSnapshot(graph);

    const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
    modifiedGraph.version = 2;
    modifiedGraph.nodes[1].config.body = "return query.trim();";

    const modifiedCode = snapshot.code.replace(
      "return query.toUpperCase();",
      "return query.toLowerCase();"
    );

    // Resolve keeping code
    const resolvedSnapshot = resolveConflict("node-2", "code", modifiedGraph, modifiedCode, snapshot);

    // The snapshot should contain the code's body
    expect(resolvedSnapshot.graph.nodes[1].config.body).toBe("return query.toLowerCase();");
    expect(resolvedSnapshot.code).toContain("return query.toLowerCase();");
  });

  describe("false-positive guards", () => {
    it("comment-only code edit + unrelated graph config change on different node → both-ahead, NOT conflict", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // 1. Hand-add a comment to transform function (node-2) in code
      const modifiedCode = snapshot.code.replace(
        "return query.toUpperCase();",
        "// A custom comment\n  return query.toUpperCase();"
      );

      // 2. Perform an unrelated change to the input node (node-1) defaultValue on graph side
      const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      modifiedGraph.version = 2;
      modifiedGraph.nodes[0].config.defaultValue = "new default";

      // Detect drift
      const result = detectDrift(modifiedGraph, modifiedCode, snapshot);

      // Disjoint: node-1 changed on graph, node-2 changed in code → both-ahead
      expect(result.status).toBe("both-ahead");
      if (result.status === "both-ahead") {
        expect(result.graphChangedNodeIds).toEqual(["node-1"]);
        expect(result.codeChangedSymbols).toEqual(["upperCase"]);
      }
    });

    it("disjoint logic changes on separate nodes → both-ahead, NOT conflict", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Node A (node-1 / input): change defaultValue on graph side
      const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      modifiedGraph.version = 2;
      modifiedGraph.nodes[0].config.defaultValue = "changed value";

      // Node B (node-2 / upperCase transform): change body in code (actual logic, not just a comment)
      const modifiedCode = snapshot.code.replace(
        "return query.toUpperCase();",
        "return query.toUpperCase() + '!!!';"
      );

      const result = detectDrift(modifiedGraph, modifiedCode, snapshot);

      // These are disjoint: node-1 on graph, node-2 in code → both-ahead
      expect(result.status).toBe("both-ahead");
      if (result.status === "both-ahead") {
        expect(result.graphChangedNodeIds).toEqual(["node-1"]);
        expect(result.codeChangedSymbols).toEqual(["upperCase"]);
      }
    });

    it("overlapping changes on the SAME node → true conflict (not both-ahead)", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Both sides edit node-2 (the upperCase transform)
      // Graph side: change the transform body via config
      const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      modifiedGraph.version = 2;
      modifiedGraph.nodes[1].config.body = "return query.trim();";

      // Code side: also change the transform body to something else
      const modifiedCode = snapshot.code.replace(
        "return query.toUpperCase();",
        "return query.toLowerCase();"
      );

      const result = detectDrift(modifiedGraph, modifiedCode, snapshot);

      // Same node on both sides → true conflict
      expect(result.status).toBe("conflict");
      if (result.status === "conflict") {
        expect(result.graphChangedNodeIds).toContain("node-2");
        expect(result.codeChangedSymbols).toContain("upperCase");
      }
    });

    it("position-only changes on graph side do not trigger any graph changed node lists", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      const movedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      movedGraph.nodes[1].position = { x: 999, y: 999 }; // move node

      const result = detectDrift(movedGraph, snapshot.code, snapshot);
      expect(result.status).toBe("clean");
    });
  });

  describe("edge-level change detection", () => {
    it("pure edge rewire (no node fields touched) → graph-ahead with both old and new endpoint nodes", () => {
      // Set up: 3 nodes, edge from node-1→node-2 and node-2→node-3
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Rewire: disconnect node-1→node-2 and connect node-1→node-3 directly instead.
      // No node config/label/ports change — only the edge endpoint changes.
      const rewiredGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      rewiredGraph.version = 2;

      // Replace e1 (node-1→node-2) with e1 (node-1→node-3)
      rewiredGraph.edges[0] = {
        id: "e1",
        source: { nodeId: "node-1", portId: "node-1_out" },
        target: { nodeId: "node-3", portId: "node-3_in" },
      };

      const result = detectDrift(rewiredGraph, snapshot.code, snapshot);

      // The rewire changes edges but no node fields. detectDrift should still
      // detect this as a graph-side change on the affected endpoint nodes.
      expect(result.status).toBe("graph-ahead");
      if (result.status === "graph-ahead") {
        // node-2 was the old target, node-3 is the new target, node-1 is the source.
        // All three should appear (node-2 lost an incoming edge, node-3 gained one,
        // node-1's edge target changed).
        expect(result.changedNodeIds).toContain("node-1");
        expect(result.changedNodeIds).toContain("node-2");
        expect(result.changedNodeIds).toContain("node-3");
      }
    });

    it("edge removal → graph-ahead with both disconnected endpoints", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Remove the first edge (node-1→node-2), keep the second (node-2→node-3)
      const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      modifiedGraph.version = 2;
      modifiedGraph.edges = [modifiedGraph.edges[1]]; // keep only e2

      const result = detectDrift(modifiedGraph, snapshot.code, snapshot);

      expect(result.status).toBe("graph-ahead");
      if (result.status === "graph-ahead") {
        // node-1 and node-2 are the endpoints of the removed edge
        expect(result.changedNodeIds).toContain("node-1");
        expect(result.changedNodeIds).toContain("node-2");
      }
    });

    it("edge addition → graph-ahead with both new endpoints", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Add a new edge node-1→node-3 (skip the middle transform)
      const modifiedGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      modifiedGraph.version = 2;
      modifiedGraph.edges.push({
        id: "e3",
        source: { nodeId: "node-1", portId: "node-1_out" },
        target: { nodeId: "node-3", portId: "node-3_in_extra" },
      });

      const result = detectDrift(modifiedGraph, snapshot.code, snapshot);

      expect(result.status).toBe("graph-ahead");
      if (result.status === "graph-ahead") {
        expect(result.changedNodeIds).toContain("node-1");
        expect(result.changedNodeIds).toContain("node-3");
      }
    });

    it("edge rewire + unrelated code edit on a different node → both-ahead (not conflict)", () => {
      const graph = createBaseGraph();
      const snapshot = createSnapshot(graph);

      // Rewire e1: node-1→node-2 becomes node-1→node-3 (graph-side change on node-1,2,3)
      const rewiredGraph = JSON.parse(JSON.stringify(graph)) as Graph;
      rewiredGraph.version = 2;
      rewiredGraph.edges[0] = {
        id: "e1",
        source: { nodeId: "node-1", portId: "node-1_out" },
        target: { nodeId: "node-3", portId: "node-3_in" },
      };

      // Code-side: edit the transform body of node-2 (upperCase)
      // But node-2 changed on BOTH sides (it lost an incoming edge on graph side,
      // and its code body was edited). So this is actually a conflict on node-2.
      const modifiedCode = snapshot.code.replace(
        "return query.toUpperCase();",
        "return query.toUpperCase() + '!';"
      );

      const result = detectDrift(rewiredGraph, modifiedCode, snapshot);

      // node-2 is in both changed sets → true conflict
      expect(result.status).toBe("conflict");
      if (result.status === "conflict") {
        expect(result.graphChangedNodeIds).toContain("node-2");
        expect(result.codeChangedSymbols).toContain("upperCase");
      }
    });
  });
});
