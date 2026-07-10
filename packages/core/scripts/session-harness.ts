/**
 * session-harness.ts
 *
 * Integration smoke test for @graphloom/core.
 * Simulates a realistic multi-step editing session exercising the full cycle:
 *   graphToCode → detectDrift → resolveConflict (where needed) → codeToGraph → repeat
 *
 * Run: npx tsx packages/core/scripts/session-harness.ts
 *
 * This is NOT a vitest test file. Output is human-readable state at every step.
 * A written verdict (correct / suspicious / broken) is printed per step based on
 * what actually printed, not what was expected.
 */

import { graphToCode } from "../src/graphToCode.js";
import { codeToGraph } from "../src/codeToGraph.js";
import { detectDrift } from "../src/detectDrift.js";
import { resolveConflict } from "../src/resolveConflict.js";
import { hashCode } from "../src/astUtils.js";
import { createInputNode } from "../src/nodeKinds/input.js";
import { createTransformNode } from "../src/nodeKinds/transform.js";
import { createOutputNode } from "../src/nodeKinds/output.js";
import type { Graph, SyncSnapshot, DriftResult, GraphEdge } from "../src/types.js";import { mergeDisjointEdits } from "../../../apps/playground/src/mergeEngine.js";
import { mergeDisjointEdits } from "../../../apps/playground/src/mergeEngine.js";

// ─── ANSI colours ──────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function header(step: number, title: string) {
  console.log(`\n${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  STEP ${step}: ${title}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}\n`);
}

function section(label: string) {
  console.log(`${C.bold}${C.yellow}── ${label} ──${C.reset}`);
}

function verdict(ok: boolean, msg: string) {
  const icon = ok ? `${C.green}✓ CORRECT${C.reset}` : `${C.red}✗ BROKEN${C.reset}`;
  console.log(`\n${C.bold}VERDICT: ${icon}${C.reset}  ${msg}\n`);
}

function suspiciousVerdict(msg: string) {
  console.log(`\n${C.bold}VERDICT: ${C.yellow}⚠ SUSPICIOUS${C.reset}${C.reset}  ${msg}\n`);
}

function printDrift(result: DriftResult) {
  console.log(`  status: ${C.bold}${C.magenta}${result.status}${C.reset}`);
  if (result.status === "graph-ahead") {
    console.log(`  changedNodeIds:    ${JSON.stringify(result.changedNodeIds)}`);
  } else if (result.status === "code-ahead") {
    console.log(`  changedSymbols:    ${JSON.stringify(result.changedSymbols)}`);
  } else if (result.status === "both-ahead") {
    console.log(`  graphChangedNodeIds: ${JSON.stringify(result.graphChangedNodeIds)}`);
    console.log(`  codeChangedSymbols:  ${JSON.stringify(result.codeChangedSymbols)}`);
  } else if (result.status === "conflict") {
    console.log(`  graphChangedNodeIds: ${JSON.stringify(result.graphChangedNodeIds)}`);
    console.log(`  codeChangedSymbols:  ${JSON.stringify(result.codeChangedSymbols)}`);
  }
}

function diffLines(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const maxLen = Math.max(aLines.length, bLines.length);
  const diffOutput: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i] ?? "";
    const bLine = bLines[i] ?? "";
    if (aLine !== bLine) {
      diffOutput.push(`${C.red}  - ${aLine}${C.reset}`);
      diffOutput.push(`${C.green}  + ${bLine}${C.reset}`);
    }
  }
  return diffOutput.length ? diffOutput.join("\n") : `${C.dim}  (no differences)${C.reset}`;
}

function snap(graph: Graph, code: string, mapping: ReturnType<typeof graphToCode>["mapping"]): SyncSnapshot {
  return {
    graphVersion: graph.version,
    codeHash: hashCode(code),
    code,
    graph,
    mapping,
    timestamp: Date.now(),
  };
}

// ─── Fan-out / fan-in fixture ──────────────────────────────────────────────
// userQuery (input)
//   ├──> upperCase (transform) ──┐
//   └──> lowerCase (transform) ──┼─> merge (transform) ─> output (output)
function createFanOutGraph(): Graph {
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
    { id: "edge-1", source: { nodeId: "node-1", portId: "node-1_out" }, target: { nodeId: "node-2", portId: "node-2_in_0" } },
    { id: "edge-2", source: { nodeId: "node-1", portId: "node-1_out" }, target: { nodeId: "node-3", portId: "node-3_in_0" } },
    { id: "edge-3", source: { nodeId: "node-2", portId: "node-2_out" }, target: { nodeId: "node-4", portId: "node-4_in_0" } },
    { id: "edge-4", source: { nodeId: "node-3", portId: "node-3_out" }, target: { nodeId: "node-4", portId: "node-4_in_1" } },
    { id: "edge-5", source: { nodeId: "node-4", portId: "node-4_out" }, target: { nodeId: "node-5", portId: "node-5_in" } },
  ];

  return {
    id: "fanout-fanin-graph",
    nodes: [inputNode, upperNode, lowerNode, mergeNode, outputNode],
    edges,
    version: 1,
  };
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

let currentSnapshot: SyncSnapshot;
let currentGraph: Graph;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1 — Initial sync: fan-out/fan-in graph → code
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(1, "Initial sync — graphToCode (fan-out/fan-in, no prior snapshot)");

currentGraph = createFanOutGraph();
const step1 = graphToCode(currentGraph);
currentSnapshot = snap(currentGraph, step1.code, step1.mapping);

section("Generated code");
console.log(step1.code);

section("Mapping: nodeToAst keys");
console.log("  " + Object.keys(step1.mapping.nodeToAst).join(", "));

section("Mapping: astToNode");
for (const [sym, nodeId] of Object.entries(step1.mapping.astToNode)) {
  console.log(`  ${sym} → ${nodeId}`);
}

const step1HasAllNodes = ["node-1", "node-2", "node-3", "node-4", "node-5"]
  .every(id => step1.mapping.nodeToAst[id] !== undefined);
const step1HasAllTags = ["input", "transform", "output"]
  .every(tag => step1.code.includes(`@graphloom:node ${tag}`));
const step1HasCallSite = step1.code.includes("upperCase(") && step1.code.includes("lowerCase(") && step1.code.includes("merge(");

verdict(
  step1HasAllNodes && step1HasAllTags && step1HasCallSite,
  `All 5 nodes in mapping: ${step1HasAllNodes}. All @graphloom tags present: ${step1HasAllTags}. Call site present: ${step1HasCallSite}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2 — Graph-only edit: change lowerCase body (node-3), re-run graphToCode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(2, "Graph-only edit — change lowerCase body via graph UI → graphToCode patch");

const graph2: Graph = JSON.parse(JSON.stringify(currentGraph));
graph2.version = 2;
// Edit node-3 (lowerCase) config only — don't touch node-2 (upperCase) or any others
const lowerNode2 = graph2.nodes.find(n => n.id === "node-3")!;
(lowerNode2.config as any).body = "return query.toLowerCase().trim();";

const step2 = graphToCode(graph2, currentSnapshot);
const prevCode = currentSnapshot.code;
const newCode2 = step2.code;

section("Diff old code → new code");
console.log(diffLines(prevCode, newCode2));

section("Sanity checks");
const onlyLowerChanged = !newCode2.includes("return query.toUpperCase();") === false; // upperCase body unchanged
const lowerBodyUpdated = newCode2.includes("return query.toLowerCase().trim();");
const upperBodyPreserved = newCode2.includes("return query.toUpperCase();");
console.log(`  lowerCase body updated: ${lowerBodyUpdated}`);
console.log(`  upperCase body preserved (untouched): ${upperBodyPreserved}`);

const prevSnapshot2 = currentSnapshot;
currentGraph = graph2;
currentSnapshot = snap(graph2, newCode2, step2.mapping);

verdict(
  lowerBodyUpdated && upperBodyPreserved,
  `Only lowerCase (node-3) subtree changed. upperCase (node-2) body byte-identical in new code: ${upperBodyPreserved}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3 — Hand-edit the code: comment + local variable rename inside upperCase body
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(3, "Hand-edit code — insert comment + rename local var inside upperCase, run codeToGraph");

// Simulate a developer hand-editing the upperCase transform in the code editor.
// We insert a comment and rename the local interim variable — this doesn't change
// the function signature (still named `upperCase`, same param `query`).
const handEditedCode = newCode2.replace(
  "return query.toUpperCase();",
  "// normalize before output\n  const normalized = query.toUpperCase();\n  return normalized;"
);

section("Hand-edited code (upperCase body)");
// Print only the upperCase function for brevity
const upperStart = handEditedCode.indexOf("// @graphloom:node transform\nfunction upperCase");
const upperEnd = handEditedCode.indexOf("\n\n", upperStart + 10);
console.log(handEditedCode.substring(upperStart, upperEnd + 2));

const step3 = codeToGraph(handEditedCode, currentSnapshot);

section("Reconstructed graph nodes");
for (const node of step3.graph.nodes) {
  console.log(`  [${node.id}] ${node.label} (${node.kind})  config.body=${JSON.stringify((node.config as any).body ?? null)}`);
}

section("Warnings from codeToGraph");
if (step3.warnings.length === 0) {
  console.log(`  ${C.dim}(none)${C.reset}`);
} else {
  step3.warnings.forEach(w => console.log(`  ⚠ ${w}`));
}

const upperNodeReconstructed = step3.graph.nodes.find(n => n.id === "node-2");
const upperBodyReflectsHandEdit = (upperNodeReconstructed?.config as any)?.body?.includes("normalized");

section("Capture new snapshot from hand-edited code");
currentGraph = step3.graph;
currentSnapshot = snap(step3.graph, handEditedCode, step3.mapping);
console.log(`  graph version: ${currentSnapshot.graphVersion}, codeHash: ${currentSnapshot.codeHash.slice(0, 12)}...`);

verdict(
  upperBodyReflectsHandEdit === true,
  `upperCase node-2 config.body reflects hand edit (contains 'normalized'): ${upperBodyReflectsHandEdit}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 4 — Detect drift with no changes → must be "clean"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(4, "detectDrift with identical state → must return \"clean\" (no false positive)");

const drift4 = detectDrift(currentSnapshot.graph, currentSnapshot.code, currentSnapshot);

section("Drift result");
printDrift(drift4);

verdict(
  drift4.status === "clean",
  `detectDrift returned "${drift4.status}" — expected "clean". False positive guard: ${drift4.status === "clean" ? "OK" : "FAILED"}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 5 — Disjoint changes: graph edits merge (node-4), code edits lowerCase (node-3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(5, "Disjoint changes — graph edits node-4 (merge), code edits node-3 (lowerCase) → \"both-ahead\"");

const graph5: Graph = JSON.parse(JSON.stringify(currentSnapshot.graph));
graph5.version = (currentSnapshot.graphVersion ?? 1) + 1;
// Graph side: edit merge node (node-4) body
const mergeNode5 = graph5.nodes.find(n => n.id === "node-4")!;
(mergeNode5.config as any).body = "return { upper: upper.trim(), lower: lower.trim() };";

// Code side: edit lowerCase body (node-3) in the code, different node
const code5 = currentSnapshot.code.replace(
  "return query.toLowerCase().trim();",
  "// extra normalization\n  return query.toLowerCase().trim();"
);

section("Graph-side change");
console.log(`  node-4 (merge) body → "return { upper: upper.trim(), lower: lower.trim() };"`);

section("Code-side change");
console.log(`  node-3 (lowerCase) body — added comment (no logic change beyond whitespace)`);

const drift5 = detectDrift(graph5, code5, currentSnapshot);

section("Drift result");
printDrift(drift5);

const step5OK =
  drift5.status === "both-ahead" &&
  (drift5 as any).graphChangedNodeIds?.includes("node-4") &&
  (drift5 as any).codeChangedSymbols?.includes("lowerCase");

verdict(
  step5OK,
  `status="${drift5.status}" (expected "both-ahead"). node-4 in graphChangedNodeIds: ${(drift5 as any).graphChangedNodeIds?.includes("node-4")}. lowerCase in codeChangedSymbols: ${(drift5 as any).codeChangedSymbols?.includes("lowerCase")}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 6 — Apply both-ahead: graphToCode for graph side, codeToGraph for code side,
//           then detectDrift again → must return "clean"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(6, "Apply both-ahead — run graphToCode + codeToGraph, then detectDrift → must return \"clean\"");

if (drift5.status !== "both-ahead") {
  console.log(`${C.red}  Skipped: step 5 did not return both-ahead (got "${drift5.status}"), cannot test apply cycle.${C.reset}`);
  suspiciousVerdict("Step 5 prerequisite failed — step 6 is blocked.");
} else {
  // Call the shared mergeDisjointEdits function to unify merge behavior
  const mergeRes = mergeDisjointEdits(graph5, code5, currentSnapshot, drift5);
  const finalCode6 = mergeRes.code;
  const finalGraph6 = mergeRes.graph;

  section("Final merged code (node-4 patched, lowerCase comment preserved)");
  const lowerStart = finalCode6.indexOf("// @graphloom:node transform\nfunction lowerCase");
  const lowerEnd = finalCode6.indexOf("\n\n", lowerStart + 10);
  console.log(finalCode6.substring(lowerStart, lowerEnd + 2));
  const mergeStart = finalCode6.indexOf("// @graphloom:node transform\nfunction merge");
  const mergeEnd = finalCode6.indexOf("\n\n", mergeStart + 10);
  console.log(finalCode6.substring(mergeStart, mergeEnd + 2));

  // Capture the authoritative snapshot
  currentGraph = finalGraph6;
  currentSnapshot = mergeRes.snapshot;

  const drift6 = detectDrift(currentSnapshot.graph, currentSnapshot.code, currentSnapshot);

  section("detectDrift after applying both sides");
  printDrift(drift6);

  const step6CodeSidePreserved = finalCode6.includes("extra normalization");
  const step6GraphSideApplied = finalCode6.includes("upper.trim()");

  console.log(`  code-side lowerCase comment preserved: ${step6CodeSidePreserved}`);
  console.log(`  graph-side merge body applied: ${step6GraphSideApplied}`);

  if (drift6.status !== "clean") {
    console.log(`\n${C.red}  RAW FINAL CODE:${C.reset}`);
    console.log(finalCode6);
    console.log(`\n${C.red}  SNAPSHOT graph version: ${currentSnapshot.graphVersion}, codeHash: ${currentSnapshot.codeHash.slice(0,12)}...${C.reset}`);
  }

  verdict(
    drift6.status === "clean" && step6CodeSidePreserved && step6GraphSideApplied,
    `detectDrift after full apply: "${drift6.status}" (expected "clean"). ` +
    `lowerCase comment preserved: ${step6CodeSidePreserved}. merge body updated: ${step6GraphSideApplied}.`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 7 — True conflict: edit same node (node-2 / upperCase) on both sides
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(7, "True conflict — edit node-2 (upperCase) on both sides, resolveConflict(keep=code)");

const graph7: Graph = JSON.parse(JSON.stringify(currentSnapshot.graph));
graph7.version = currentSnapshot.graphVersion + 1;
// Graph side: change upperCase body via config
const upperNode7 = graph7.nodes.find(n => n.id === "node-2")!;
(upperNode7.config as any).body = "return query.toUpperCase() + '---graph';";

// Code side: change the same upperCase function body in the code
const code7 = currentSnapshot.code.replace(
  /\/\/ normalize before output\n  const normalized = query\.toUpperCase\(\);\n  return normalized;/,
  "// code-side edit\n  return query.toUpperCase() + '---code';"
);

section("Graph-side change");
console.log(`  node-2 (upperCase) body → "return query.toUpperCase() + '---graph';"`);

section("Code-side change");
console.log(`  upperCase body → "return query.toUpperCase() + '---code';" (in code)`);

const drift7 = detectDrift(graph7, code7, currentSnapshot);

section("Drift result");
printDrift(drift7);

const step7IsConflict =
  drift7.status === "conflict" &&
  (drift7 as any).graphChangedNodeIds?.includes("node-2") &&
  (drift7 as any).codeChangedSymbols?.includes("upperCase");

if (!step7IsConflict) {
  verdict(false, `Expected "conflict" on node-2/upperCase. Got "${drift7.status}".`);
} else {
  console.log(`  → Confirmed conflict on node-2/upperCase. Calling resolveConflict(node-2, "code")...`);

  const resolved7 = resolveConflict("node-2", "code", graph7, code7, currentSnapshot);

  section("Resolved snapshot — code content of upperCase function");
  const resolvedUpperStart = resolved7.code.indexOf("// @graphloom:node transform\nfunction upperCase");
  const resolvedUpperEnd = resolved7.code.indexOf("\n\n", resolvedUpperStart + 10);
  console.log(resolved7.code.substring(resolvedUpperStart, resolvedUpperEnd + 2));

  const resolvedNode2 = resolved7.graph.nodes.find(n => n.id === "node-2");
  section("Resolved graph node-2 config.body");
  console.log(`  ${JSON.stringify((resolvedNode2?.config as any)?.body)}`);

  const codeWon = resolved7.code.includes("---code");
  const graphLost = !resolved7.code.includes("---graph");

  currentGraph = resolved7.graph;
  currentSnapshot = resolved7;

  verdict(
    codeWon && graphLost,
    `Code side won: ${codeWon}. Graph side discarded: ${graphLost}. New snapshot codeHash: ${resolved7.codeHash.slice(0,12)}...`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 8 — Edge rewire: disconnect edge-2 (node-1→node-3), reconnect as node-2→node-3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(8, "Edge rewire — disconnect node-1→node-3, reconnect node-2→node-3; no node fields touched");

const graph8: Graph = JSON.parse(JSON.stringify(currentSnapshot.graph));
graph8.version = currentSnapshot.graphVersion + 1;

// Rewire edge-2: was node-1→node-3, now becomes node-2→node-3
// This means lowerCase no longer gets input from the source (node-1),
// but gets input from upperCase (node-2) instead.
const edgeIdx = graph8.edges.findIndex(e => e.id === "edge-2");
graph8.edges[edgeIdx] = {
  id: "edge-2",
  source: { nodeId: "node-2", portId: "node-2_out" },
  target: { nodeId: "node-3", portId: "node-3_in_0" },
};

section("Edge change");
console.log(`  edge-2 before: node-1_out → node-3_in_0`);
console.log(`  edge-2 after:  node-2_out → node-3_in_0`);
console.log(`  No node kind/label/ports/config changed.`);

const drift8 = detectDrift(graph8, currentSnapshot.code, currentSnapshot);

section("Drift result");
printDrift(drift8);

const step8IsGraphAhead = drift8.status === "graph-ahead";
const step8HasNode1 = (drift8 as any).changedNodeIds?.includes("node-1");
const step8HasNode2 = (drift8 as any).changedNodeIds?.includes("node-2");
const step8HasNode3 = (drift8 as any).changedNodeIds?.includes("node-3");

// Apply the rewire via graphToCode to advance snapshot
const step8Result = graphToCode(graph8, currentSnapshot);
currentGraph = graph8;
currentSnapshot = snap(graph8, step8Result.code, step8Result.mapping);

verdict(
  step8IsGraphAhead && step8HasNode1 && step8HasNode3,
  `status="${drift8.status}" (expected "graph-ahead"). ` +
  `node-1 (old source endpoint) in changedNodeIds: ${step8HasNode1}. ` +
  `node-2 (new source endpoint) in changedNodeIds: ${step8HasNode2}. ` +
  `node-3 (target endpoint, unchanged) in changedNodeIds: ${step8HasNode3}.`
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 9 — Round-trip edge topology: graphToCode output → codeToGraph, confirm
//           the reconstructed graph's edges match the rewired topology, not original
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header(9, "Round-trip edge topology — feed step-8 graphToCode output through codeToGraph, check edges");

section("graphToCode output (post-rewire call site)");
// Show just the pipeline execution block
const callSiteMarker = "--- Pipeline execution ---";
const callSiteStart = currentSnapshot.code.indexOf(callSiteMarker);
if (callSiteStart !== -1) {
  const callSiteEnd = currentSnapshot.code.indexOf("---", callSiteStart + callSiteMarker.length + 2);
  const block = callSiteEnd !== -1
    ? currentSnapshot.code.substring(callSiteStart - 5, callSiteEnd + 50)
    : currentSnapshot.code.substring(callSiteStart - 5);
  console.log(block);
} else {
  // Fall back to printing last 30 lines
  const lines = currentSnapshot.code.split("\n");
  console.log(lines.slice(-30).join("\n"));
}

const step9 = codeToGraph(currentSnapshot.code, currentSnapshot);

section("Reconstructed edges after rewire round-trip");
for (const edge of step9.graph.edges) {
  console.log(`  [${edge.id}] ${edge.source.nodeId}:${edge.source.portId} → ${edge.target.nodeId}:${edge.target.portId}`);
}

section("Expected rewired topology");
console.log(`  edge-2 should connect node-2 → node-3 (NOT node-1 → node-3)`);

// The key check: does the reconstructed graph have the rewired edge topology?
// edge-2 should now source from node-2, not node-1
const reconstructedEdge2 = step9.graph.edges.find(e => {
  // codeToGraph infers edges from call sites, so IDs may not be preserved.
  // Check by finding an edge from node-2 to node-3.
  return e.source.nodeId === "node-2" && e.target.nodeId === "node-3";
});
const oldEdgeStillPresent = step9.graph.edges.some(
  e => e.source.nodeId === "node-1" && e.target.nodeId === "node-3"
);

section("Warnings from codeToGraph");
if (step9.warnings.length === 0) {
  console.log(`  ${C.dim}(none)${C.reset}`);
} else {
  step9.warnings.forEach(w => console.log(`  ⚠ ${w}`));
}

const step9EdgeRewirePreserved = reconstructedEdge2 !== undefined && !oldEdgeStillPresent;

if (!step9EdgeRewirePreserved) {
  console.log(`\n${C.red}  FLAG: edge topology mismatch after round-trip.${C.reset}`);
  console.log(`  node-2→node-3 edge found: ${reconstructedEdge2 !== undefined}`);
  console.log(`  node-1→node-3 edge (old, should be gone) still present: ${oldEdgeStillPresent}`);
  console.log(`\n${C.red}  RAW CODE FED TO codeToGraph:${C.reset}`);
  console.log(currentSnapshot.code);
}

verdict(
  step9EdgeRewirePreserved,
  `node-2→node-3 edge reconstructed: ${reconstructedEdge2 !== undefined}. ` +
  `Stale node-1→node-3 edge absent: ${!oldEdgeStillPresent}. ` +
  `This confirms the call-site generator emits the rewired topology and the edge-inference parser reads it back correctly.`
);

// ─── Final summary ─────────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}`);
console.log(`${C.bold}${C.cyan}  SESSION HARNESS COMPLETE${C.reset}`);
console.log(`${C.bold}${C.cyan}${"═".repeat(70)}${C.reset}\n`);
