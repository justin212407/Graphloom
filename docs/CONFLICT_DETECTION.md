# GraphLoom — Conflict Detection

Expands on `sync_engine.md` §3. This is the feature the whole pitch hinges on — "one broken sync between what you see and what runs is a trust problem, not just a bug" — so it gets its own spec rather than living as a paragraph.

## 1. What "drift" means here

Drift is detected relative to the **last successful sync snapshot**, not relative to some absolute truth. GraphLoom has no opinion about which side is "right" — it only knows what changed since both sides last agreed.

```ts
interface SyncSnapshot {
  graphVersion: number;
  codeHash: string;
  code: string;
  graph: Graph;
  mapping: CodeMapping;
  timestamp: number;
}
```

## 2. Granularity: per-node, not per-file

A naive implementation hashes the whole graph and the whole file and compares two booleans. That's not good enough — if the graph changed in one unrelated node while the code was hand-edited in another, treating that as a whole-file conflict forces the user to throw away unrelated work. GraphLoom instead diffs at node/symbol granularity:

1. Walk `current.graph.nodes`, compare each to `prevSnapshot.graph.nodes` by id → produces `graphChangedNodeIds: string[]`.
2. Walk the AST of `current.code`, compare each tagged symbol's subtree hash to the hash recorded in `prevSnapshot.mapping` → produces `codeChangedSymbols: string[]`.
3. Map `codeChangedSymbols` back to node ids via `mapping.astToNode`.
4. Intersect: a node id present in **both** changed sets is a true conflict. A node id in only one set is a clean, safe, one-directional update.

```
status:
  "clean"        -> neither set has entries
  "graph-ahead"   -> only graphChangedNodeIds is non-empty
  "code-ahead"   -> only codeChangedSymbols is non-empty
  "conflict"     -> intersection is non-empty
```

## 3. Resolution API

GraphLoom never auto-resolves a true conflict. It exposes the conflicting set and lets the host application (the playground, or whatever embeds the library) decide:

```ts
function resolveConflict(
  nodeId: string,
  keep: "graph" | "code"
): void;
```

Calling this for a given node commits one side as the new snapshot for that node only — other nodes in the same sync cycle that weren't in conflict are unaffected. This is deliberately per-node, matching the granularity in §2.

## 4. What counts as a "change" (avoiding false positives)

- Whitespace-only or comment-only edits to a transform body **do** count as a code-side change (they're part of what round-trip fidelity is supposed to preserve), but they never conflict with a graph-side change unless the graph edit touched that same node's config.
- Re-running `graphToCode()` with no actual graph delta must not mark the code as "graph-ahead" — the engine compares against the previous **snapshot**, not against "was this function just regenerated." Regeneration that produces byte-identical output is a no-op for drift purposes.
- Node position changes (drag without reconnecting) are tracked separately from logical changes (see `data_model.md` §5) and never trigger a conflict on their own — moving a node while editing its code should not be treated as contested.

## 5. UI contract

The playground surfaces conflicts as a non-blocking banner listing affected node ids, not a modal that halts editing. Each entry gets a two-button "keep graph" / "keep code" choice, calling `resolveConflict()` above. This keeps the demo honest to the pitch: the tool surfaces risk, it doesn't get in the way.

## 6. Explicitly deferred (not v1)

- No automatic three-way merge (e.g. line-level merge of a transform body edited on both sides)
- No conflict history/audit log — only the current snapshot vs. current state is compared
- No collaborative/multi-user conflict scenarios — this is single-editor, single-timeline drift detection only
