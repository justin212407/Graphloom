/**
 * codeToGraph tests — Day 2 per IMPLEMENTATION_PLAN.md
 */

import { describe, it, expect } from "vitest";
import { codeToGraph } from "../src/codeToGraph.js";

describe("codeToGraph unit tests", () => {
  it("parses tagged input node with generic type annotation", () => {
    const code = `
// @graphloom:node input
const query = defineInput<string>("query", "init val");
`;
    const { graph } = codeToGraph(code);
    expect(graph.nodes.length).toBe(1);
    const node = graph.nodes[0];
    expect(node.kind).toBe("input");
    expect(node.label).toBe("query");
    expect(node.outputs[0].type).toBe("string");
    expect(node.config.defaultValue).toBe("init val");
  });

  it("parses tagged fetch node and extracts template and method", () => {
    const code = `
// @graphloom:node fetch
async function getSearch(query: string): Promise<any[]> {
  const response = await fetch(\`/api/v1/search?q=\${query}\`, {
    method: "POST"
  });
  return response.json();
}
`;
    const { graph } = codeToGraph(code);
    expect(graph.nodes.length).toBe(1);
    const node = graph.nodes[0];
    expect(node.kind).toBe("fetch");
    expect(node.label).toBe("getSearch");
    expect(node.inputs[0].name).toBe("query");
    expect(node.inputs[0].type).toBe("string");
    expect(node.outputs[0].type).toBe("array");
    expect(node.config.urlTemplate).toBe("/api/v1/search?q=${query}");
    expect(node.config.method).toBe("POST");
  });

  it("parses tagged transform node and extracts parameters, return, and body verbatim", () => {
    const code = `
// @graphloom:node transform
function filterItems(items: unknown[], limit: number): unknown[] {
  // Verbatim comment
  return items.filter(x => !!x).slice(0, limit);
}
`;
    const { graph } = codeToGraph(code);
    expect(graph.nodes.length).toBe(1);
    const node = graph.nodes[0];
    expect(node.kind).toBe("transform");
    expect(node.label).toBe("filterItems");
    expect(node.inputs[0].name).toBe("items");
    expect(node.inputs[0].type).toBe("array");
    expect(node.inputs[1].name).toBe("limit");
    expect(node.inputs[1].type).toBe("number");
    expect(node.outputs[0].type).toBe("array");
    expect(node.config.body).toContain("// Verbatim comment");
    expect(node.config.body).toContain("return items.filter");
  });

  it("parses tagged output node", () => {
    const code = `
// @graphloom:node output
function complete(result: object) {
  return result;
}
`;
    const { graph } = codeToGraph(code);
    expect(graph.nodes.length).toBe(1);
    const node = graph.nodes[0];
    expect(node.kind).toBe("output");
    expect(node.label).toBe("complete");
    expect(node.inputs[0].name).toBe("result");
    expect(node.inputs[0].type).toBe("object");
  });

  it("handles fallback to any for untyped variables/parameters with warnings", () => {
    const code = `
// @graphloom:node transform
function noTypes(arg) {
  return arg;
}
`;
    const { graph, warnings } = codeToGraph(code);
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0].inputs[0].type).toBe("any");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("untyped");
  });

  it("rejects multiple output nodes with a parser-level error", () => {
    const code = `
// @graphloom:node output
function finish1(val: any) {}

// @graphloom:node output
function finish2(val: any) {}
`;
    expect(() => codeToGraph(code)).toThrow(/multiple output nodes/i);
  });
});
