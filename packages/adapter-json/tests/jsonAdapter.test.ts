import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode, GraphEdge } from '@graphloom/core';
import {
  toGraphLoomGraph,
  fromGraphLoomGraph,
  type JsonGraph,
  type JsonNode,
  type JsonEdge,
} from '../src/JSONAdapter';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function createJsonGraph(): JsonGraph {
  return {
    id: 'test-pipeline',
    nodes: [
      {
        id: 'n1',
        kind: 'input',
        label: 'userQuery',
        x: 100,
        y: 50,
        inputs: [],
        outputs: [['n1_out', 'query', 'string']],
        config: { defaultValue: 'hello' },
      },
      {
        id: 'n2',
        kind: 'transform',
        label: 'upperCase',
        x: 300,
        y: 50,
        inputs: [['n2_in', 'text', 'string']],
        outputs: [['n2_out', 'result', 'string']],
        config: { body: 'return text.toUpperCase();' },
      },
      {
        id: 'n3',
        kind: 'output',
        label: 'display',
        x: 500,
        y: 50,
        inputs: [['n3_in', 'data', 'any']],
        outputs: [],
        config: {},
      },
    ],
    edges: [
      ['n1', 'n1_out', 'n2', 'n2_in'],
      ['n2', 'n2_out', 'n3', 'n3_in'],
    ],
  };
}

function createGraphLoomGraph(): Graph {
  return {
    id: 'test-pipeline',
    version: 5,
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
      {
        id: 'n3',
        kind: 'output',
        label: 'display',
        inputs: [{ id: 'n3_in', name: 'data', type: 'any' }],
        outputs: [],
        config: {},
        position: { x: 500, y: 50 },
      },
    ],
    edges: [
      { id: 'e1', source: { nodeId: 'n1', portId: 'n1_out' }, target: { nodeId: 'n2', portId: 'n2_in' } },
      { id: 'e2', source: { nodeId: 'n2', portId: 'n2_out' }, target: { nodeId: 'n3', portId: 'n3_in' } },
    ],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('JSONAdapter', () => {
  describe('toGraphLoomGraph', () => {
    it('converts JSON shape to Graph with correct structure', () => {
      const json = createJsonGraph();
      const graph = toGraphLoomGraph(json, 1);

      expect(graph.id).toBe('test-pipeline');
      expect(graph.version).toBe(1);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);

      // Check flat x/y → position translation
      const n1 = graph.nodes.find(n => n.id === 'n1')!;
      expect(n1.position).toEqual({ x: 100, y: 50 });
      expect(n1.kind).toBe('input');
      expect(n1.label).toBe('userQuery');
      expect(n1.config).toEqual({ defaultValue: 'hello' });

      // Check port tuple → Port object translation
      expect(n1.outputs).toEqual([{ id: 'n1_out', name: 'query', type: 'string' }]);

      // Check edge tuple → GraphEdge translation
      const edge0 = graph.edges[0];
      expect(edge0.source).toEqual({ nodeId: 'n1', portId: 'n1_out' });
      expect(edge0.target).toEqual({ nodeId: 'n2', portId: 'n2_in' });
    });
  });

  describe('fromGraphLoomGraph', () => {
    it('converts Graph to JSON shape with correct structure', () => {
      const graph = createGraphLoomGraph();
      const json = fromGraphLoomGraph(graph);

      expect(json.id).toBe('test-pipeline');
      // version is NOT in the JSON shape — intentionally dropped
      expect((json as any).version).toBeUndefined();

      expect(json.nodes).toHaveLength(3);
      expect(json.edges).toHaveLength(2);

      // Check position → flat x/y translation
      const n1 = json.nodes.find(n => n.id === 'n1')!;
      expect(n1.x).toBe(100);
      expect(n1.y).toBe(50);
      expect(n1.kind).toBe('input');

      // Check Port → tuple translation
      expect(n1.outputs).toEqual([['n1_out', 'query', 'string']]);

      // Check GraphEdge → tuple translation
      expect(json.edges[0]).toEqual(['n1', 'n1_out', 'n2', 'n2_in']);
      expect(json.edges[1]).toEqual(['n2', 'n2_out', 'n3', 'n3_in']);
    });
  });

  describe('round-trip: JSON → Graph → JSON', () => {
    it('preserves all data through a round trip', () => {
      const original = createJsonGraph();
      const graph = toGraphLoomGraph(original, 42);
      const roundTripped = fromGraphLoomGraph(graph);

      // Structural equality (excluding version which is not in JSON shape)
      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.nodes).toHaveLength(original.nodes.length);
      expect(roundTripped.edges).toHaveLength(original.edges.length);

      // Deep equality of nodes
      for (let i = 0; i < original.nodes.length; i++) {
        const orig = original.nodes[i];
        const rt = roundTripped.nodes[i];
        expect(rt.id).toBe(orig.id);
        expect(rt.kind).toBe(orig.kind);
        expect(rt.label).toBe(orig.label);
        expect(rt.x).toBe(orig.x);
        expect(rt.y).toBe(orig.y);
        expect(rt.config).toEqual(orig.config);
        expect(rt.inputs).toEqual(orig.inputs);
        expect(rt.outputs).toEqual(orig.outputs);
      }

      // Deep equality of edges
      expect(roundTripped.edges).toEqual(original.edges);
    });
  });

  describe('round-trip: Graph → JSON → Graph', () => {
    it('preserves all data through a round trip', () => {
      const original = createGraphLoomGraph();
      const json = fromGraphLoomGraph(original);
      const roundTripped = toGraphLoomGraph(json, original.version);

      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.version).toBe(original.version);
      expect(roundTripped.nodes).toHaveLength(original.nodes.length);
      expect(roundTripped.edges).toHaveLength(original.edges.length);

      // Check each node
      for (let i = 0; i < original.nodes.length; i++) {
        const orig = original.nodes[i];
        const rt = roundTripped.nodes[i];
        expect(rt.id).toBe(orig.id);
        expect(rt.kind).toBe(orig.kind);
        expect(rt.label).toBe(orig.label);
        expect(rt.position).toEqual(orig.position);
        expect(rt.config).toEqual(orig.config);
        expect(rt.inputs).toEqual(orig.inputs);
        expect(rt.outputs).toEqual(orig.outputs);
      }

      // Edges — edge IDs are generated, so compare structure
      for (let i = 0; i < original.edges.length; i++) {
        expect(roundTripped.edges[i].source).toEqual(original.edges[i].source);
        expect(roundTripped.edges[i].target).toEqual(original.edges[i].target);
      }
    });
  });

  describe('missing fields handling', () => {
    it('supplies default x/y when missing', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          { id: 'n1', kind: 'input', label: 'test' } as any,
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    it('supplies default kind when invalid', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          { id: 'n1', kind: 'unknown_kind', label: 'test', x: 0, y: 0 },
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].kind).toBe('transform');
    });

    it('supplies empty arrays for missing inputs/outputs', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          { id: 'n1', kind: 'transform', label: 'test', x: 0, y: 0 },
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].inputs).toEqual([]);
      expect(graph.nodes[0].outputs).toEqual([]);
    });

    it('supplies empty config when missing', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          { id: 'n1', kind: 'transform', label: 'test', x: 0, y: 0 },
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].config).toEqual({});
    });

    it('falls back to "any" for invalid port types', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          {
            id: 'n1',
            kind: 'transform',
            label: 'test',
            x: 0,
            y: 0,
            inputs: [['p1', 'data', 'invalid_type']],
          },
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].inputs[0].type).toBe('any');
    });

    it('uses node id as label fallback when label is missing', () => {
      const json: JsonGraph = {
        id: 'test',
        nodes: [
          { id: 'myNode', kind: 'transform', x: 10, y: 20 } as any,
        ],
        edges: [],
      };
      const graph = toGraphLoomGraph(json, 1);
      expect(graph.nodes[0].label).toBe('myNode');
    });
  });
});
