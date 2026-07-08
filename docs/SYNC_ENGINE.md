# GraphLoom — Sync Engine

This is the load-bearing part of the whole project. Everything else (canvas, editor, adapters) is scaffolding around these three functions.

## 1. `graphToCode(graph, prevSnapshot?)`

**Naive approach (what to avoid):** stringify the graph into a fresh code file every time. This is what almost every existing tool does, and it's why none of them are trustworthy — any hand edit to the output is destroyed on the next regeneration.

**GraphLoom's approach: patch, don't regenerate.**

1. If `prevSnapshot` exists, load its code into an AST (`ts-morph`).
2. Topologically sort `graph.nodes` by edge dependency.
3. For each node:
   - If `prevSnapshot.mapping.nodeToAst[node.id]` exists **and** the node's config/ports haven't changed since the snapshot → leave the corresponding AST subtree untouched. This is how a manually added comment or reformatted line survives.
   - If the node is new → generate a fresh AST fragment (function or statement) and insert it in topological position.
   - If the node's config changed (e.g. a `TransformNode` body edited via the graph UI) → replace only that subtree, not the whole file.
   - If a node was deleted → remove its AST fragment and any now-dangling references.
4. Re-print the AST (`ts-morph`/`recast` preserve formatting of untouched nodes; only touched regions get re-formatted).
5. Build a new `CodeMapping` from node ids to the (possibly moved) AST spans.
6. Return `{ code, mapping }`. Caller is responsible for snapshotting.

This is the mechanism that makes the round-trip claim true rather than aspirational: **untouched subtrees are never re-printed**, so whitespace, comments, and variable names outside the changed region survive.

## 2. `codeToGraph(code, prevSnapshot?)`

1. Parse `code` into an AST.
2. Walk top-level function/statement declarations. Each one that matches the expected node-vocabulary shape (see `data_model.md` §4) maps to a `GraphNode`:
   - Function name → `symbol` in `AstRef`
   - Parameters/return type → inferred ports (typed where possible, `any` otherwise)
   - Function body → `config.body` for `TransformNode`, etc.
3. Data-flow edges are reconstructed from call arguments: if `nodeB`'s generated call passes `nodeA`'s output as an argument, emit a `GraphEdge` from A→B.
4. Anything in the code that doesn't match the node vocabulary (arbitrary helper functions, imports, etc.) is preserved in a `passthrough` region of the file and left alone — it's not forced into a node, and it's not deleted.
5. Node positions are inherited from `prevSnapshot.graph` by matching AST symbol → prior node id; new nodes get a default layout position (e.g. placed after their dependencies).
6. Return `{ graph, mapping }`.

## 3. `detectDrift(current, prevSnapshot)`

This runs **before** either sync direction is allowed to overwrite the other side. It's the feature that turns this from a toy into something worth pitching.

```
graphChanged = current.graph.version !== prevSnapshot.graphVersion
codeChanged  = hash(current.code) !== prevSnapshot.codeHash

if !graphChanged && !codeChanged:  status = "clean"
if graphChanged && !codeChanged:   status = "graph-ahead"   -> safe to regenerate code
if !graphChanged && codeChanged:   status = "code-ahead"    -> safe to regenerate graph
if graphChanged && codeChanged:    status = "conflict"      -> do NOT auto-apply either direction
```

On `"conflict"`, the engine returns the specific node ids (graph side) and symbols (code side) that diverged, so the caller (the playground UI, or any host application) can render a diff and let the user choose a side per-node rather than losing one side wholesale. GraphLoom itself never picks a winner — that's a deliberate API boundary, not a missing feature.

## 4. Why AST-level, not JSON-level

A JSON export can't preserve "I renamed this variable" or "I added a comment explaining why this transform exists" — JSON has no concept of those things. Operating at the AST level is what lets GraphLoom claim genuine bidirectionality instead of "graph is the source of truth, code is a read-only view." That distinction is the entire pitch, so it's worth the extra day of engineering effort relative to a naive stringify-based approach.

## 5. Known limitations (v1, stated honestly)

- Only the fixed node vocabulary round-trips cleanly from code back to graph; arbitrary hand-written code is preserved but not visualized.
- Structural conflicts (e.g. a node deleted on the graph side while its code was being edited) resolve to `"conflict"` and require a manual choice — there's no automatic three-way merge in v1.
- Formatting preservation depends on `ts-morph`/`recast` guarantees; deeply unusual formatting (e.g. hand-aligned columns) may still get reflowed on touched regions.
