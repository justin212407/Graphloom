# GraphLoom — Data Model

## 1. Core types

```ts
type PortType = "string" | "number" | "boolean" | "object" | "array" | "any";

interface Port {
  id: string;
  name: string;
  type: PortType;
}

type NodeKind = "input" | "fetch" | "transform" | "output";

interface GraphNode {
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

interface GraphEdge {
  id: string;
  source: { nodeId: string; portId: string };
  target: { nodeId: string; portId: string };
}

interface Graph {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Monotonic version, bumped on every structural change, used by drift detection */
  version: number;
}
```

## 2. Code-side representation

GraphLoom doesn't treat code as an opaque string — every sync cycle carries a mapping between graph elements and their AST locations, so edits can be patched in place rather than regenerated from scratch.

```ts
interface CodeMapping {
  /** graph node id -> AST node reference (e.g. function name + span) */
  nodeToAst: Record<string, AstRef>;
  /** AST node reference -> graph node id, for the reverse direction */
  astToNode: Record<string, string>;
}

interface AstRef {
  /** identifier used in generated code, e.g. the function/variable name */
  symbol: string;
  /** source span, used to patch in place instead of full regeneration */
  start: number;
  end: number;
}
```

## 3. Sync metadata (drift detection)

This is the piece that makes GraphLoom more than a one-way exporter. Every successful sync snapshots both sides so the next sync can tell what actually changed and on which side.

```ts
interface SyncSnapshot {
  graphVersion: number;
  /** hash of the generated code at last sync, not the live editor content */
  codeHash: string;
  code: string;
  graph: Graph;
  mapping: CodeMapping;
  timestamp: number;
}

type DriftResult =
  | { status: "clean" }
  | { status: "graph-ahead"; changedNodeIds: string[] }
  | { status: "code-ahead"; changedSymbols: string[] }
  | { status: "both-ahead"; graphChangedNodeIds: string[]; codeChangedSymbols: string[] }
  | { status: "conflict"; graphChangedNodeIds: string[]; codeChangedSymbols: string[] };
```

`status: "both-ahead"` means both sides changed since the last snapshot, but on completely disjoint nodes — each side's change is independently safe to apply (see `CONFLICT_DETECTION.md` §2: "A node id in only one set is a clean, safe, one-directional update").

`status: "conflict"` means at least one node id is present in **both** the graph-changed and code-changed sets. GraphLoom's contract is to surface the conflicting set to the caller rather than pick a winner — see `sync_engine.md` §3.

## 4. Node vocabulary config shapes (v1)

Kept intentionally minimal — enough to express a believable pipeline, not a general-purpose language.

```ts
// InputNode.config
{ defaultValue?: unknown; [key: string]: unknown }

// FetchNode.config
{ urlTemplate: string; method: "GET" | "POST"; [key: string]: unknown }

// TransformNode.config
{ body: string; [key: string]: unknown } // a pure JS expression/function body, patched in place on edit

// OutputNode.config
{ [key: string]: unknown } // terminal, no config
```

## 5. Why position lives on the node

Round-tripping layout (x/y) alongside logic is a deliberate choice: if code edits caused nodes to jump around on every regen, the demo would look broken even if the logic sync were perfect. Position is preserved unless a node is structurally added/removed.
