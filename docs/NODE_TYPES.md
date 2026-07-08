# GraphLoom — Node Types

Four node kinds for v1. Deliberately fixed and small — see `PRD.md` §7 on why breadth is the wrong axis to optimize under a 4-day budget.

## 1. `InputNode`

**Purpose:** declares an entry point value for the graph.

| Field | Type | Notes |
|---|---|---|
| `inputs` | `[]` | none — this is a source |
| `outputs` | `[{ id, name, type }]` | exactly one port, the declared value |
| `config.defaultValue` | `unknown?` | optional; used for playground preview execution |

**Code shape:** `const x = defineInput<T>("name")` — see `PARSER_RULES.md` §2.

**Validation:** name must be a valid JS identifier; type must be a known `PortType`.

## 2. `FetchNode`

**Purpose:** represents an async I/O boundary (API call, DB read, tool call). This is the node kind that makes the demo graph look like an AI pipeline rather than a generic flowchart.

| Field | Type | Notes |
|---|---|---|
| `inputs` | `Port[]` | one per function parameter |
| `outputs` | `[Port]` | single output, the resolved value |
| `config.urlTemplate` | `string` | supports `${paramName}` interpolation for the demo; real usage would swap this for a proper call body, out of scope for v1 |
| `config.method` | `"GET" \| "POST"` | |

**Code shape:** `async function name(...) { ... }`, tagged `fetch`.

**Validation:** must be `async`; must have a body that returns a value (used to infer the output port type when no explicit return type is given).

## 3. `TransformNode`

**Purpose:** a pure(ish) function over its inputs — the "logic" node. This is where the interesting graph↔code fidelity test lives, because the body is free-form code that must survive round-trips untouched.

| Field | Type | Notes |
|---|---|---|
| `inputs` | `Port[]` | one per parameter |
| `outputs` | `[Port]` | single output |
| `config.body` | `string` | raw function body, captured and replayed verbatim — never re-derived from the graph, only ever patched at the AST-subtree level (see `sync_engine.md` §1) |

**Code shape:** plain (non-async) function, tagged `transform`.

**Validation:** none beyond signature shape — body content is intentionally opaque to GraphLoom (see `PARSER_RULES.md` §5).

## 4. `OutputNode`

**Purpose:** terminal node. Every graph has exactly one.

| Field | Type | Notes |
|---|---|---|
| `inputs` | `[Port]` | single input, whatever the pipeline resolves to |
| `outputs` | `[]` | none — this is a sink |
| `config` | `{}` | no configuration |

**Code shape:** function tagged `output`, called by nothing else (verified — see `EDGE_CASES.md` §"multiple outputs").

## 5. Extensibility (post-v1, not built now)

The `NodeKind` union and the parser/generator switch on it are the two places a fifth node kind would need to plug in. Both are documented here specifically so that adding, say, a `BranchNode` (conditional routing) later is a scoped, two-file change rather than a rearchitecture. Not doing this now — a `BranchNode` reintroduces control flow into the graph model, which is explicitly deferred (see `PRD.md` §4 non-goals).
