# GraphLoom — Architecture

## 1. System overview

GraphLoom has three layers, deliberately decoupled so the sync engine isn't married to React Flow:

```
┌─────────────────────────────────────────────────────────┐
│                      Demo Playground                     │
│        React Flow canvas   ⇄   Monaco code editor        │
└───────────────────────┬───────────────────┬─────────────┘
                         │                   │
                 GraphAdapter          CodeAdapter
                 (React Flow ⇄          (string ⇄
                  GraphLoom Graph)       GraphLoom Code)
                         │                   │
┌────────────────────────▼───────────────────▼────────────┐
│                     Sync Engine (core)                    │
│   graphToCode()    codeToGraph()    detectDrift()         │
└────────────────────────┬───────────────────┬─────────────┘
                          │                   │
                   Graph Model          Code Model (AST)
                (nodes, edges, ports)   (via ts-morph/recast)
```

## 2. Components

### 2.1 Core package (`@graphloom/core`)
Framework-agnostic. No React Flow, no Monaco. Exposes:
- `Graph` type + validation
- `graphToCode(graph, lastSyncedCode?) -> { code, mapping }`
- `codeToGraph(code, lastSyncedGraph?) -> { graph, mapping }`
- `detectDrift(current, lastSynced) -> DriftResult`

This is the part that should be publishable and demo-able independent of any UI. It's also the part that matters most for the "is this real" test — it should have its own test suite with round-trip fixtures.

### 2.2 Adapters
Thin translation layers so the core never imports a specific editor library:
- `GraphAdapter<T>` interface: `toGraphLoomGraph(editorState: T) -> Graph`, `fromGraphLoomGraph(graph: Graph) -> T`
- v1 ships one concrete adapter: `ReactFlowAdapter`
- This is what lets the README honestly say "adapter-based, React Flow shipped first" instead of hardcoding a coupling — small cost, meaningfully better positioning.

### 2.3 Node vocabulary (v1, intentionally small)
Four node types, enough to express a believable AI-pipeline demo:
- `InputNode` — declares a typed input value
- `FetchNode` — represents an async data/API call
- `TransformNode` — a pure function over its inputs
- `OutputNode` — terminal node, what the pipeline returns

Each has typed input/output ports so codeToGraph can validate that hand-written code still produces a legal graph.

### 2.4 Demo playground (`apps/playground`)
- React Flow canvas on the left, Monaco on the right
- On graph change → `graphToCode()` → update Monaco (debounced)
- On code change → `codeToGraph()` → update canvas (debounced, only on valid parse)
- Drift banner: if `detectDrift()` returns a conflict, show a non-destructive warning with a diff instead of auto-applying

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Graph UI | React Flow | Industry-standard, adapter isolates the dependency |
| Code UI | Monaco | Same editor VS Code uses, familiar to devs |
| AST engine | `ts-morph` (or `recast` as fallback) | Structural code generation/parsing that preserves formatting and comments — this is the load-bearing dependency for the whole pitch |
| Language | TypeScript throughout | Type-safe node/port definitions double as validation |
| Packaging | pnpm workspace, `core` + `adapters` + `playground` | Keeps core publishable independent of the demo app |

## 4. Data flow (single sync cycle)

1. User edits graph in React Flow.
2. `ReactFlowAdapter.toGraphLoomGraph()` converts editor state → `Graph`.
3. `graphToCode(graph, lastSyncedCode)` walks the graph topologically, and either:
   - patches the existing AST in place (preferred — preserves comments/formatting/hand edits), or
   - generates fresh AST if no prior code exists.
4. New code string rendered into Monaco; `lastSyncedCode` and `lastSyncedGraph` snapshots updated.
5. Reverse direction is symmetric: code edit → `codeToGraph()` parses the AST back into a `Graph`, diffed against `lastSyncedGraph` before applying to the canvas.

See `sync_engine.md` for the actual algorithm and drift detection logic, and `data_model.md` for the exact shapes being passed around.
