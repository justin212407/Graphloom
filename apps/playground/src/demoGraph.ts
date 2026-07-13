import type { Graph } from '@graphloom/core';
import { createInputNode, createTransformNode, createOutputNode, createFetchNode } from '@graphloom/core';

/**
 * Demo graph: AI pipeline shape (fan-out/fan-in)
 *
 * userQuery (input)
 *   ├──> upperCase (transform) ──┐
 *   └──> lowerCase (transform) ──┼─> merge (transform) ─> output
 */
export function createDemoGraph(): Graph {
  const inputNode = createInputNode({
    id: 'node-1',
    label: 'userQuery',
    outputType: 'string',
    defaultValue: 'hello world',
    position: { x: 50, y: 200 },
  });

  const upperNode = createTransformNode({
    id: 'node-2',
    label: 'upperCase',
    inputs: [{ name: 'query', type: 'string' }],
    outputType: 'string',
    body: 'return query.toUpperCase();',
    position: { x: 350, y: 80 },
  });

  const fetchNode = createFetchNode({
    id: 'node-3',
    label: 'fetchSuffix',
    inputs: [{ name: 'query', type: 'string' }],
    outputType: 'string',
    urlTemplate: 'https://api.example.com/suffix?q=${query}',
    method: 'GET',
    position: { x: 350, y: 320 },
  });

  const mergeNode = createTransformNode({
    id: 'node-4',
    label: 'merge',
    inputs: [
      { name: 'upper', type: 'string' },
      { name: 'lower', type: 'string' },
    ],
    outputType: 'object',
    body: 'return { upper, lower };',
    position: { x: 650, y: 200 },
  });

  const outputNode = createOutputNode({
    id: 'node-5',
    label: 'output',
    inputType: 'object',
    position: { x: 950, y: 200 },
  });

  return {
    id: 'demo-graph',
    nodes: [inputNode, upperNode, fetchNode, mergeNode, outputNode],
    edges: [
      { id: 'edge-1', source: { nodeId: 'node-1', portId: 'node-1_out' }, target: { nodeId: 'node-2', portId: 'node-2_in_0' } },
      { id: 'edge-2', source: { nodeId: 'node-1', portId: 'node-1_out' }, target: { nodeId: 'node-3', portId: 'node-3_in_0' } },
      { id: 'edge-3', source: { nodeId: 'node-2', portId: 'node-2_out' }, target: { nodeId: 'node-4', portId: 'node-4_in_0' } },
      { id: 'edge-4', source: { nodeId: 'node-3', portId: 'node-3_out' }, target: { nodeId: 'node-4', portId: 'node-4_in_1' } },
      { id: 'edge-5', source: { nodeId: 'node-4', portId: 'node-4_out' }, target: { nodeId: 'node-5', portId: 'node-5_in' } },
    ],
    version: 1,
  };
}
