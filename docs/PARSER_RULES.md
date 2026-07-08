# GraphLoom — Parser Rules

Rules `codeToGraph()` uses to recognize node-vocabulary shapes inside arbitrary TS/JS source. If code doesn't match these rules, it's left in the `passthrough` region (see `sync_engine.md` §2.4) rather than forced into a node or dropped.

## 1. Recognition markers

Every GraphLoom-managed declaration carries a leading comment tag so the parser doesn't have to guess intent from shape alone:

```ts
// @graphloom:node input
const userQuery = defineInput<string>("userQuery");

// @graphloom:node fetch
async function fetchResults(query: string) {
  return fetch(`/api/search?q=${query}`).then(r => r.json());
}

// @graphloom:node transform
function rankResults(results: unknown[]) {
  return results.slice(0, 10);
}

// @graphloom:node output
function output(ranked: unknown[]) {
  return ranked;
}
```

The tag is the ground truth for "is this a node" — inferring purely from function shape is what makes parsers brittle. A tagged function is always attempted as a node; an untagged one is always passthrough, even if it looks node-shaped.

## 2. Per-kind parsing rules

- **`input`**: must be a `defineInput<T>("name")` call assigned to a `const`. `T` maps to `PortType` via a fixed lookup (`string`, `number`, `boolean`, `object`, `array`; anything else → `any` with a parser warning, not an error).
- **`fetch`**: an `async function`. Parameters become input ports. Return type, if present, becomes the single output port; if absent, output port type is `any` and a warning is attached (see `EDGE_CASES.md` §"untyped returns").
- **`transform`**: a plain function. Parameters → input ports, return expression's inferred type → output port. Function body is captured verbatim as `config.body` — GraphLoom does not attempt to parse or validate the body's internals, only its signature.
- **`output`**: a function with a `// @graphloom:node output` tag and no downstream consumers. If a second output-tagged function is found, this is a parse-level error (see `EDGE_CASES.md`), not a warning — a graph has exactly one terminal in v1.

## 3. Edge inference

Edges are reconstructed from **call sites**, not from declarations:

1. Find every call expression whose callee matches a tagged node's symbol.
2. For each argument at position `i`, if the argument expression is itself a call to another tagged node (or a reference to a `const` bound to one), emit an edge from that node's output port to the current node's input port `i`.
3. Arguments that are literals or references to untagged variables do not produce edges — they become part of the node's `config` instead (e.g. a hardcoded parameter), not a graph connection.

This means the **call site**, not the function declaration order, is what defines the graph topology. Declarations can appear in any order in the file; GraphLoom topologically sorts based on the call graph it reconstructs.

## 4. Type inference for ports

Priority order, first match wins:
1. Explicit TS type annotation on the parameter/return
2. Inferred literal type from a default value
3. Fallback to `"any"` with a non-blocking parser warning

Parser warnings are surfaced to the caller (see `CONFLICT_DETECTION.md`) but never block a sync — an `any`-typed port is valid, just less useful for downstream validation.

## 5. What's explicitly NOT parsed

- Control flow inside a `transform` body (if/else, loops) — captured as opaque `config.body`, not decomposed into sub-nodes
- Classes, decorators (other than the `@graphloom:node` comment tag), generics beyond the single-type-param case above
- Multi-file graphs — v1 assumes one graph maps to one file

If the parser hits a tagged node it can't fully resolve (e.g. destructured parameters, spread args), it downgrades that single node to passthrough and emits a warning rather than failing the whole parse. Partial success beats a hard failure on one weird function.
