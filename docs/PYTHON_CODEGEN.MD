# GraphLoom — Python Codegen (Stretch Goal)

**Status: stretch goal, gated behind diff view + second adapter completion. One-directional only — no reverse parsing.**

## 1. Scope

`graphToCode(graph, prevSnapshot?, target: "python")` produces readable, tagged Python source from a `Graph` — signatures, types, and call-site wiring. This is generation-only: there is no `codeToGraph` support for Python, no patch-in-place regeneration for Python output (every Python generation is fresh — Python never advances past the "Day 1: fresh-generation only" stage described in `sync_engine.md`), and Python output is never part of a `SyncSnapshot` or drift detection. It exists purely to prove GraphLoom's `Graph` model isn't tied to one output language, matching VectorShift's actual Python/FastAPI backend.

## 2. What gets translated

| Node kind | Python shape |
|---|---|
| `input` | A plain typed module-level variable, or a `define_input(name, default=None)` call — pick one, document the choice here once decided, don't do both |
| `fetch` | `async def` function, signature shaped by `config.urlTemplate`/`config.method` |
| `transform` | `def` function with a typed signature. **Body is NOT transpiled from JS** — see §3 |
| `output` | `def` function, terminal |

Type mapping: `PortType` → Python type hints — `string`→`str`, `number`→`float`, `boolean`→`bool`, `object`→`dict`, `array`→`list`, `any`→ left untyped or `typing.Any`.

## 3. The hard limitation — do not attempt to solve this

`TransformNode.config.body` is raw JS expression text (per `NODE_TYPES.md` §3), not an AST-portable representation. There is no general way to transpile arbitrary JS into equivalent Python, and building one is a project in itself — wildly out of scope for a stretch feature. Do not attempt it.

Correct scope: emit the signature and an honest placeholder body:

```python
# @graphloom:node transform
def rank_results(results: list) -> list:
    # TODO: port from JS — original body:
    # return results.slice(0, 10);
    raise NotImplementedError("ported from JS, needs manual translation")
```

This proves the type/signature/wiring translation works without pretending to solve general code translation.

## 4. Explicitly deferred — not this stretch goal, not later without a new doc

- Reverse parsing (`codeToGraph` equivalent) for Python
- Patch-in-place regeneration for Python
- Any transpilation of `TransformNode` body logic
- Python-side drift detection or conflict handling
- Any codegen target beyond Python and TS

## 5. Definition of done, if attempted

- `graphToCode(graph, undefined, "python")` produces valid, importable Python for the Day 2 fan-out/fan-in fixture
- Existing `target: "ts"` behavior is provably unchanged — the full Day 1-3 test suite passes against the refactored dispatcher with zero modifications to existing test expectations
- At least one test asserts the §3 placeholder-body behavior for a `TransformNode`

If this doesn't fit in the remaining time, cut it entirely. An unfinished Python target producing invalid syntax is worse for a demo than no Python target at all.