import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Graph } from '@graphloom/core';
import {
  toGraphLoomGraph,
  fromGraphLoomGraph,
  type ReactFlowState,
} from '../src/ReactFlowAdapter';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function createRFState(): ReactFlowState {
  return {
    nodes: [
      {
        id: 'n1',
        type: 'input',
        position: { x: 100, y: 50 },
        data: {
          kind: 'input',
          label: 'userQuery',
          inputs: [],
          outputs: [{ id: 'n1_out', name: 'query', type: 'string' }],
          config: { defaultValue: 'hello' },
        },
      },
      {
        id: 'n2',
        type: 'transform',
        position: { x: 300, y: 50 },
        data: {
          kind: 'transform',
          label: 'upperCase',
          inputs: [{ id: 'n2_in', name: 'text', type: 'string' }],
          outputs: [{ id: 'n2_out', name: 'result', type: 'string' }],
          config: { body: 'return text.toUpperCase();' },
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        sourceHandle: 'n1_out',
        targetHandle: 'n2_in',
      },
    ],
  };
}

function createGraphLoomGraph(): Graph {
  return {
    id: 'test-pipeline',
    version: 3,
    nodes: [
      {
        id: 'n1',
        kind: 'input',
        label: 'userQuery',
        inputs: [],
        outputs: [{ id: 'n1_out', name: 'query', type: 'string' }],
        config: { defaultValue: 'hello' },
        position: { x: 100, y: 50 },
      },
      {
        id: 'n2',
        kind: 'transform',
        label: 'upperCase',
        inputs: [{ id: 'n2_in', name: 'text', type: 'string' }],
        outputs: [{ id: 'n2_out', name: 'result', type: 'string' }],
        config: { body: 'return text.toUpperCase();' },
        position: { x: 300, y: 50 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: { nodeId: 'n1', portId: 'n1_out' },
        target: { nodeId: 'n2', portId: 'n2_in' },
      },
    ],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReactFlowAdapter', () => {
  describe('toGraphLoomGraph', () => {
    it('converts React Flow state to Graph with correct structure', () => {
      const state = createRFState();
      const graph = toGraphLoomGraph(state, 'test-graph', 2);

      expect(graph.id).toBe('test-graph');
      expect(graph.version).toBe(2);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);

      const n1 = graph.nodes.find(n => n.id === 'n1')!;
      expect(n1.position).toEqual({ x: 100, y: 50 });
      expect(n1.kind).toBe('input');
      expect(n1.label).toBe('userQuery');
      expect(n1.config).toEqual({ defaultValue: 'hello' });

      const edge = graph.edges[0];
      expect(edge.id).toBe('e1');
      expect(edge.source).toEqual({ nodeId: 'n1', portId: 'n1_out' });
      expect(edge.target).toEqual({ nodeId: 'n2', portId: 'n2_in' });
    });
  });

  describe('fromGraphLoomGraph', () => {
    it('converts Graph to React Flow state with correct structure', () => {
      const graph = createGraphLoomGraph();
      const state = fromGraphLoomGraph(graph);

      expect(state.nodes).toHaveLength(2);
      expect(state.edges).toHaveLength(1);

      const n1 = state.nodes.find(n => n.id === 'n1')!;
      expect(n1.type).toBe('input');
      expect(n1.position).toEqual({ x: 100, y: 50 });
      expect(n1.data.kind).toBe('input');
      expect(n1.data.label).toBe('userQuery');

      const edge = state.edges[0];
      expect(edge.id).toBe('e1');
      expect(edge.source).toBe('n1');
      expect(edge.target).toBe('n2');
      expect(edge.sourceHandle).toBe('n1_out');
      expect(edge.targetHandle).toBe('n2_in');
    });
  });

  describe('round-trip serialization validation', () => {
    it('preserves node and edge structures through toGraphLoomGraph -> fromGraphLoomGraph', () => {
      const originalState = createRFState();
      const graph = toGraphLoomGraph(originalState, 'test-graph', 1);
      const rtState = fromGraphLoomGraph(graph);

      expect(rtState.nodes).toHaveLength(originalState.nodes.length);
      expect(rtState.edges).toHaveLength(originalState.edges.length);

      for (let i = 0; i < originalState.nodes.length; i++) {
        const orig = originalState.nodes[i];
        const rt = rtState.nodes[i];
        expect(rt.id).toBe(orig.id);
        expect(rt.type).toBe(orig.type);
        expect(rt.position).toEqual(orig.position);
        expect(rt.data.kind).toBe(orig.data.kind);
        expect(rt.data.label).toBe(orig.data.label);
        expect(rt.data.config).toEqual(orig.data.config);
        expect(rt.data.inputs).toEqual(orig.data.inputs);
        expect(rt.data.outputs).toEqual(orig.data.outputs);
      }
    });

    it('preserves graph structures through fromGraphLoomGraph -> toGraphLoomGraph', () => {
      const originalGraph = createGraphLoomGraph();
      const state = fromGraphLoomGraph(originalGraph);
      const rtGraph = toGraphLoomGraph(state, originalGraph.id, originalGraph.version);

      expect(rtGraph.id).toBe(originalGraph.id);
      expect(rtGraph.version).toBe(originalGraph.version);
      expect(rtGraph.nodes).toEqual(originalGraph.nodes);
      
      // Compare edge properties (excluding automatically added visual styles in RF edge format)
      expect(rtGraph.edges).toHaveLength(originalGraph.edges.length);
      for (let i = 0; i < originalGraph.edges.length; i++) {
        expect(rtGraph.edges[i].source).toEqual(originalGraph.edges[i].source);
        expect(rtGraph.edges[i].target).toEqual(originalGraph.edges[i].target);
      }
    });
  });

  describe('missing fields fallback handling', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('provides defaults for missing position and warns', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state: ReactFlowState = {
        nodes: [
          {
            id: 'n1',
            data: { kind: 'input', label: 'userQuery', inputs: [], outputs: [], config: {} },
          } as any,
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(state, 'test', 1);
      expect(graph.nodes[0].position).toEqual({ x: 0, y: 0 });
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing position, falling back to {x: 0, y: 0}');
    });

    it('provides defaults for invalid or missing node kind and warns', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state: ReactFlowState = {
        nodes: [
          {
            id: 'n1',
            position: { x: 50, y: 50 },
            data: { kind: 'bad_kind', label: 'userQuery', inputs: [], outputs: [], config: {} },
          } as any,
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(state, 'test', 1);
      expect(graph.nodes[0].kind).toBe('transform');
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing or invalid kind "bad_kind", falling back to "transform"');
    });

    it('provides empty lists/objects for missing configs and ports and warns', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state: ReactFlowState = {
        nodes: [
          {
            id: 'n1',
            position: { x: 50, y: 50 },
            data: { kind: 'input' },
          } as any,
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(state, 'test', 1);
      expect(graph.nodes[0].inputs).toEqual([]);
      expect(graph.nodes[0].outputs).toEqual([]);
      expect(graph.nodes[0].config).toEqual({});
      expect(graph.nodes[0].label).toBe('n1'); // label falls back to id
      
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing label, falling back to id');
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing inputs, falling back to []');
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing outputs, falling back to []');
      expect(spy).toHaveBeenCalledWith('[ReactFlowAdapter] Node n1 missing config, falling back to {}');
    });
  });
});
