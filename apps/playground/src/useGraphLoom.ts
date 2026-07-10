import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  Node as RFNode,
  Edge as RFEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeChange,
  EdgeChange,
  Connection,
} from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { graphToCode, codeToGraph, detectDrift, resolveConflict, hashCode } from '@graphloom/core';
import type { Graph, SyncSnapshot, DriftResult, CodeMapping } from '@graphloom/core';
import { toGraphLoomGraph, fromGraphLoomGraph } from '@graphloom/adapter-reactflow';
import { createDemoGraph } from './demoGraph';
import { mergeDisjointEdits } from './mergeEngine';

const DEBOUNCE_MS = 400;

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

export function useGraphLoom() {
  // Initialize from demo graph (useMemo to avoid re-running on every render)
  const initial = useMemo(() => {
    const demoGraph = createDemoGraph();
    const result = graphToCode(demoGraph);
    const snapshot = createSnapshot(demoGraph, result.code, result.mapping);
    const rf = fromGraphLoomGraph(demoGraph);
    return { demoGraph, result, snapshot, rf };
  }, []);

  const [rfNodes, setRfNodes] = useState<RFNode[]>(initial.rf.nodes);
  const [rfEdges, setRfEdges] = useState<RFEdge[]>(initial.rf.edges);
  const [code, setCode] = useState(initial.result.code);
  const [drift, setDrift] = useState<DriftResult>({ status: 'clean' });

  const snapshotRef = useRef<SyncSnapshot>(initial.snapshot);
  const graphVersionRef = useRef(initial.demoGraph.version);
  const graphIdRef = useRef(initial.demoGraph.id);

  // Use refs for latest state to avoid stale closures in debounced callbacks
  const rfNodesRef = useRef(rfNodes);
  rfNodesRef.current = rfNodes;
  const rfEdgesRef = useRef(rfEdges);
  rfEdgesRef.current = rfEdges;
  const codeRef = useRef(code);
  codeRef.current = code;

  // Sync direction flags to prevent loops
  const syncingFromGraph = useRef(false);
  const syncingFromCode = useRef(false);
  const graphDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Graph → Code sync ──
  const syncGraphToCode = useCallback((nodes: RFNode[], edges: RFEdge[]) => {
    if (syncingFromCode.current) return;

    if (graphDebounceTimer.current) clearTimeout(graphDebounceTimer.current);
    graphDebounceTimer.current = setTimeout(() => {
      try {
        syncingFromGraph.current = true;
        graphVersionRef.current += 1;
        const graph = toGraphLoomGraph({ nodes, edges }, graphIdRef.current, graphVersionRef.current);

        // Check drift first
        const driftResult = detectDrift(graph, codeRef.current, snapshotRef.current);
        setDrift(driftResult);

        if (driftResult.status === 'conflict') {
          // Don't auto-apply — let the user resolve
          syncingFromGraph.current = false;
          return;
        }

        if (driftResult.status === 'both-ahead') {
          const mergeRes = mergeDisjointEdits(graph, codeRef.current, snapshotRef.current, driftResult);
          snapshotRef.current = mergeRes.snapshot;
          setCode(mergeRes.code);

          const rfState = fromGraphLoomGraph(mergeRes.graph);
          setRfNodes(rfState.nodes);
          setRfEdges(rfState.edges);
          setDrift({ status: 'clean' });
        } else {
          // Normal graph-ahead sync
          const result = graphToCode(graph, snapshotRef.current);
          const newSnapshot = createSnapshot(graph, result.code, result.mapping);
          snapshotRef.current = newSnapshot;
          setCode(result.code);
          setDrift({ status: 'clean' });
        }
      } catch (e) {
        console.warn('[GraphLoom] graphToCode failed:', e);
      } finally {
        syncingFromGraph.current = false;
      }
    }, DEBOUNCE_MS);
  }, []);

  // ── Code → Graph sync ──
  const syncCodeToGraph = useCallback((newCode: string) => {
    if (syncingFromGraph.current) return;

    if (codeDebounceTimer.current) clearTimeout(codeDebounceTimer.current);
    codeDebounceTimer.current = setTimeout(() => {
      try {
        syncingFromCode.current = true;

        // Build current graph from latest RF state
        const currentGraph = toGraphLoomGraph(
          { nodes: rfNodesRef.current, edges: rfEdgesRef.current },
          graphIdRef.current,
          graphVersionRef.current,
        );

        // Check drift
        const driftResult = detectDrift(currentGraph, newCode, snapshotRef.current);
        setDrift(driftResult);

        if (driftResult.status === 'conflict') {
          syncingFromCode.current = false;
          return;
        }

        if (driftResult.status === 'both-ahead') {
          const mergeRes = mergeDisjointEdits(currentGraph, newCode, snapshotRef.current, driftResult);
          snapshotRef.current = mergeRes.snapshot;
          setCode(mergeRes.code);

          const rfState = fromGraphLoomGraph(mergeRes.graph);
          setRfNodes(rfState.nodes);
          setRfEdges(mergeRes.graph.edges.map(e => ({
            id: e.id,
            source: e.source.nodeId,
            target: e.target.nodeId,
            sourceHandle: e.source.portId,
            targetHandle: e.target.portId,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          }))); // keep edges in sync
          setDrift({ status: 'clean' });
        } else {
          // Normal code-ahead sync
          const result = codeToGraph(newCode, snapshotRef.current);
          if (result.warnings.some(w => w.toLowerCase().includes('error'))) {
            syncingFromCode.current = false;
            return;
          }

          graphVersionRef.current = result.graph.version;
          const newSnapshot = createSnapshot(result.graph, newCode, result.mapping);
          snapshotRef.current = newSnapshot;

          const rfState = fromGraphLoomGraph(result.graph);
          setRfNodes(rfState.nodes);
          setRfEdges(rfState.edges);
          setDrift({ status: 'clean' });
        }
      } catch (e) {
        // Parse failure — silently leave canvas as-is per EDGE_CASES.md
        console.debug('[GraphLoom] codeToGraph parse failed (expected during typing):', (e as Error).message);
      } finally {
        syncingFromCode.current = false;
      }
    }, DEBOUNCE_MS);
  }, []);

  // ── React Flow change handlers ──
  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes(prev => {
      const updated = applyNodeChanges(changes, prev);
      // Only sync on structural changes, not position drags or selections
      const hasStructuralChange = changes.some(
        c => c.type !== 'position' && c.type !== 'dimensions' && c.type !== 'select',
      );
      if (hasStructuralChange) {
        syncGraphToCode(updated, rfEdgesRef.current);
      }
      return updated;
    });
  }, [syncGraphToCode]);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges(prev => {
      const updated = applyEdgeChanges(changes, prev);
      // Don't sync on pure selection changes
      const hasStructuralChange = changes.some(c => c.type !== 'select');
      if (hasStructuralChange) {
        syncGraphToCode(rfNodesRef.current, updated);
      }
      return updated;
    });
  }, [syncGraphToCode]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setRfEdges(prev => {
      const updated = addEdge(
        {
          ...connection,
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        },
        prev,
      );
      syncGraphToCode(rfNodesRef.current, updated);
      return updated;
    });
  }, [syncGraphToCode]);

  // ── Code change handler ──
  const onCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    syncCodeToGraph(newCode);
  }, [syncCodeToGraph]);

  // ── Drag end (position changes) ──
  const onNodeDragStop = useCallback(() => {
    // Sync position changes to code after drag ends (debounced)
    syncGraphToCode(rfNodesRef.current, rfEdgesRef.current);
  }, [syncGraphToCode]);

  // ── Conflict resolution ──
  const onResolveConflict = useCallback((nodeId: string, keep: 'graph' | 'code') => {
    try {
      const currentGraph = toGraphLoomGraph(
        { nodes: rfNodesRef.current, edges: rfEdgesRef.current },
        graphIdRef.current,
        graphVersionRef.current,
      );
      const resolved = resolveConflict(nodeId, keep, currentGraph, codeRef.current, snapshotRef.current);
      snapshotRef.current = resolved;

      const rfState = fromGraphLoomGraph(resolved.graph);
      setRfNodes(rfState.nodes);
      setRfEdges(rfState.edges);
      setCode(resolved.code);
      setDrift({ status: 'clean' });
      graphVersionRef.current = resolved.graphVersion;
    } catch (e) {
      console.error('[GraphLoom] resolveConflict failed:', e);
    }
  }, []);

  // ── Simulate conflict (for demo) ──
  const onSimulateConflict = useCallback(() => {
    // Strategy: modify code externally (change upperCase body) AND
    // graph-side (change upperCase config.body) to create a true conflict
    // We do this without updating the snapshot — creating divergence on both sides.
    const prevCode = snapshotRef.current.code;

    // External code edit: modify upperCase function body
    const externalCode = prevCode.replace(
      /return query\.toUpperCase\(\);/,
      'return query.toUpperCase() + " [external]";',
    );

    if (externalCode !== prevCode) {
      // Set the externally-edited code (without updating snapshot)
      setCode(externalCode);

      // Graph-side edit: modify upperCase config.body (without updating snapshot)
      setRfNodes(prev =>
        prev.map(n => {
          if (n.id === 'node-2') {
            return {
              ...n,
              data: {
                ...n.data,
                config: { ...(n.data.config as Record<string, unknown>), body: 'return query.toUpperCase().trim();' },
              },
            };
          }
          return n;
        }),
      );

      // After state settles, detect drift to show the conflict
      setTimeout(() => {
        const currentNodes = rfNodesRef.current.map(n => {
          if (n.id === 'node-2') {
            return {
              ...n,
              data: {
                ...n.data,
                config: { ...(n.data.config as Record<string, unknown>), body: 'return query.toUpperCase().trim();' },
              },
            };
          }
          return n;
        });
        const graph = toGraphLoomGraph(
          { nodes: currentNodes, edges: rfEdgesRef.current },
          graphIdRef.current,
          graphVersionRef.current + 1,
        );
        const d = detectDrift(graph, externalCode, snapshotRef.current);
        setDrift(d);
      }, 50);
    } else {
      // Fallback: try lowerCase instead
      const alt = prevCode.replace(
        /return query\.toLowerCase\(\);/,
        'return query.toLowerCase() + " [external]";',
      );
      if (alt !== prevCode) {
        setCode(alt);
        setRfNodes(prev =>
          prev.map(n => {
            if (n.id === 'node-3') {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: { ...(n.data.config as Record<string, unknown>), body: 'return query.toLowerCase().trim();' },
                },
              };
            }
            return n;
          }),
        );
        setTimeout(() => {
          const currentNodes = rfNodesRef.current.map(n => {
            if (n.id === 'node-3') {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: { ...(n.data.config as Record<string, unknown>), body: 'return query.toLowerCase().trim();' },
                },
              };
            }
            return n;
          });
          const graph = toGraphLoomGraph(
            { nodes: currentNodes, edges: rfEdgesRef.current },
            graphIdRef.current,
            graphVersionRef.current + 1,
          );
          const d = detectDrift(graph, alt, snapshotRef.current);
          setDrift(d);
        }, 50);
      }
    }
  }, []);

  return {
    rfNodes,
    rfEdges,
    code,
    drift,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onCodeChange,
    onNodeDragStop,
    onResolveConflict,
    onSimulateConflict,
  };
}
