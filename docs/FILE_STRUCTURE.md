# GraphLoom — File Structure

pnpm workspace monorepo, matching `architecture.md` §2's three-layer split. Core must stay importable without pulling in React Flow or Monaco.

```
graphloom/
├── package.json                 # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── data_model.md
│   ├── sync_engine.md
│   ├── PARSER_RULES.md
│   ├── NODE_TYPES.md
│   ├── CONFLICT_DETECTION.md
│   ├── FILE_STRUCTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── EDGE_CASES.md
│
├── packages/
│   ├── core/                    # @graphloom/core — framework-agnostic
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── types.ts             # Graph, GraphNode, GraphEdge, Port, CodeMapping, SyncSnapshot
│   │   │   ├── graphToCode.ts       # AST patch-or-generate, per sync_engine.md §1
│   │   │   ├── codeToGraph.ts       # AST parse + edge inference, per PARSER_RULES.md
│   │   │   ├── detectDrift.ts       # per CONFLICT_DETECTION.md
│   │   │   ├── resolveConflict.ts
│   │   │   ├── nodeKinds/
│   │   │   │   ├── input.ts
│   │   │   │   ├── fetch.ts
│   │   │   │   ├── transform.ts
│   │   │   │   └── output.ts        # per NODE_TYPES.md, one file per kind
│   │   │   ├── astUtils.ts          # ts-morph/recast wrappers, hashing helpers
│   │   │   └── index.ts             # public API surface
│   │   └── tests/
│   │       ├── graphToCode.test.ts
│   │       ├── codeToGraph.test.ts
│   │       ├── roundtrip.test.ts    # graph -> code -> graph fixtures, the fidelity proof
│   │       └── drift.test.ts
│   │
│   └── adapter-reactflow/       # @graphloom/adapter-reactflow
│       ├── package.json
│       └── src/
│           ├── ReactFlowAdapter.ts  # toGraphLoomGraph / fromGraphLoomGraph
│           └── index.ts
│
└── apps/
    └── playground/               # demo app, not published
        ├── package.json
        ├── src/
        │   ├── App.tsx               # split-pane layout
        │   ├── Canvas.tsx            # React Flow side
        │   ├── CodePane.tsx          # Monaco side
        │   ├── DriftBanner.tsx       # conflict UI, per CONFLICT_DETECTION.md §5
        │   ├── demoGraph.ts          # the seeded AI-pipeline example graph
        │   └── main.tsx
        └── index.html
```

## Notes on structure decisions

- **`core` has zero UI dependencies.** This is what makes the "adapter-based, not React-Flow-locked" claim in `architecture.md` true rather than aspirational — if `core/package.json` ever grows a `react` or `reactflow` dependency, that's a structural regression.
- **One file per node kind** in `nodeKinds/`, not a single switch statement — matches the extensibility note in `NODE_TYPES.md` §5, keeps a future fifth node kind a two-file addition.
- **`roundtrip.test.ts` is the most important test file in the repo.** It should contain the actual fixtures that prove graph→code→graph and code→graph→code preserve comments, variable names, and formatting. If this suite is thin, the core pitch is unverified.
- **`playground` is intentionally unpublished** — it's a demo/proof surface, not a product. Keeping it out of the publishable package list avoids accidentally shipping Monaco/React Flow as dependents of `@graphloom/core`.
