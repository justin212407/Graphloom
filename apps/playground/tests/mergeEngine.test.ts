import { describe, it, expect } from 'vitest';
import { graphToCode, codeToGraph, detectDrift, hashCode } from '@graphloom/core';
import type { Graph, SyncSnapshot, CodeMapping } from '@graphloom/core';
import { createDemoGraph } from '../src/demoGraph';
import { mergeDisjointEdits } from '../src/mergeEngine';

function createSnapshot(graph: Graph, code: string, mapping: CodeMapping): SyncSnapshot {
  return {
    graphVersion: graph.version,
    codeHash: hashCode(code),
    code,
    graph,
    mapping,
    timestamp: Date.now(),
  };
}

describe('mergeDisjointEdits', () => {
  it('correctly merges disjoint edits without clobbering either side', () => {
    // 1. Initial State
    const demoGraph = createDemoGraph();
    const initialResult = graphToCode(demoGraph);
    const initialSnapshot = createSnapshot(demoGraph, initialResult.code, initialResult.mapping);

    // 2. Graph-side Edit on Node A (node-4 / merge)
    const modifiedGraph: Graph = JSON.parse(JSON.stringify(demoGraph));
    modifiedGraph.version = demoGraph.version + 1;
    const mergeNode = modifiedGraph.nodes.find(n => n.id === 'node-4')!;
    (mergeNode.config as any).body = "return { upper: upper.trim(), lower: lower.trim(), merged: true };";

    // 3. Code-side Edit on Node B (node-3 / lowerCase)
    const modifiedCode = initialResult.code.replace(
      "return response.json();",
      "// Custom developer comment\n  return response.json();"
    );

    // 4. Detect Drift
    const driftResult = detectDrift(modifiedGraph, modifiedCode, initialSnapshot);
    expect(driftResult.status).toBe('both-ahead');

    // 5. Merge
    const mergeRes = mergeDisjointEdits(modifiedGraph, modifiedCode, initialSnapshot, driftResult);

    // 6. Assertions
    // Code assertions
    expect(mergeRes.code).toContain("merged: true");
    expect(mergeRes.code).toContain("// Custom developer comment");

    // Graph config assertions
    const finalMergeNode = mergeRes.graph.nodes.find(n => n.id === 'node-4')!;
    const finalFetchNode = mergeRes.graph.nodes.find(n => n.id === 'node-3')!;

    expect((finalMergeNode.config as any).body).toContain("merged: true");
    expect((finalFetchNode.config as any).body).toBeUndefined(); // Fetch nodes don't have a body config property
    expect(mergeRes.code).toContain("// Custom developer comment");

    // Snapshot assertions
    expect(mergeRes.snapshot.graphVersion).toBe(modifiedGraph.version);
    expect(mergeRes.snapshot.code).toBe(mergeRes.code);
    expect(mergeRes.snapshot.graph).toEqual(mergeRes.graph);
  });
});
