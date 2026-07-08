/**
 * graphToCode — v0: fresh-generation only (no patching yet)
 *
 * Per IMPLEMENTATION_PLAN.md Day 1:
 * Given a Graph, topologically sort and emit tagged functions per PARSER_RULES.md §1-2.
 *
 * Patch-in-place regeneration (using prevSnapshot) is explicitly a Day 2 step —
 * do not attempt it here.
 */

import type {
  Graph,
  GraphNode,
  GraphEdge,
  CodeMapping,
  AstRef,
  FetchNodeConfig,
  TransformNodeConfig,
} from "./types.js";
import {
  createProject,
  createSourceFile,
  printSourceFile,
  portTypeToTS,
  topologicalSort,
} from "./astUtils.js";

export interface GraphToCodeResult {
  code: string;
  mapping: CodeMapping;
}

/**
 * Validates a graph before code generation.
 * Checks for: cyclic graphs, multiple output nodes, multiple edges into one input port.
 */
function validateGraph(graph: Graph): void {
  // Check for multiple output nodes (EDGE_CASES.md)
  const outputNodes = graph.nodes.filter(n => n.kind === "output");
  if (outputNodes.length > 1) {
    throw new Error(
      `Graph has ${outputNodes.length} output nodes — v1 graphs must have exactly one terminal. ` +
      `Found: [${outputNodes.map(n => n.id).join(", ")}]`
    );
  }

  // Check for multiple edges into one input port (EDGE_CASES.md)
  const targetPorts = new Map<string, string>(); // portKey -> edgeId
  for (const edge of graph.edges) {
    const portKey = `${edge.target.nodeId}:${edge.target.portId}`;
    if (targetPorts.has(portKey)) {
      throw new Error(
        `Multiple edges target input port "${portKey}" — ` +
        `an input port accepts exactly one incoming edge.`
      );
    }
    targetPorts.set(portKey, edge.id);
  }

  // Cycle detection happens inside topologicalSort
}

/**
 * Builds a lookup: for each node, which other nodes feed into it (and through which ports).
 */
function buildInputMap(
  graph: Graph
): Map<string, Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>> {
  const map = new Map<string, Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>>();

  for (const node of graph.nodes) {
    map.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const inputs = map.get(edge.target.nodeId);
    if (inputs) {
      inputs.push({
        sourceNodeId: edge.source.nodeId,
        sourcePortId: edge.source.portId,
        targetPortId: edge.target.portId,
      });
    }
  }

  return map;
}

/**
 * Gets a safe symbol (variable/function name) for a node.
 * Uses the node label directly (assumed to be a valid identifier from validation).
 */
function nodeSymbol(node: GraphNode): string {
  return node.label;
}

/**
 * Generates the code for an InputNode.
 * Code shape per PARSER_RULES.md §2: const x = defineInput<T>("name")
 */
function generateInputNode(node: GraphNode): string {
  const outputType = node.outputs[0]?.type ?? "any";
  const tsType = portTypeToTS(outputType);
  const defaultVal = (node.config as { defaultValue?: unknown }).defaultValue;
  const defaultArg = defaultVal !== undefined
    ? `, ${JSON.stringify(defaultVal)}`
    : "";

  return `// @graphloom:node input\nconst ${nodeSymbol(node)} = defineInput<${tsType}>("${node.label}"${defaultArg});\n`;
}

/**
 * Generates the code for a FetchNode.
 * Code shape per PARSER_RULES.md §2: async function name(...) { ... }, tagged fetch
 */
function generateFetchNode(
  node: GraphNode,
  incomingEdges: Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>,
  nodeMap: Map<string, GraphNode>
): string {
  const config = node.config as FetchNodeConfig;
  const params = node.inputs.map(port => {
    const tsType = portTypeToTS(port.type);
    return `${port.name}: ${tsType}`;
  }).join(", ");

  const outputType = node.outputs[0]?.type ?? "any";
  const returnType = portTypeToTS(outputType);

  // Build the function body
  const urlExpr = `\`${config.urlTemplate}\``;
  const methodStr = config.method ?? "GET";

  let bodyLines: string;
  if (methodStr === "POST") {
    bodyLines = `  const response = await fetch(${urlExpr}, {\n    method: "${methodStr}",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ ${node.inputs.map(p => p.name).join(", ")} }),\n  });\n  return response.json();`;
  } else {
    bodyLines = `  const response = await fetch(${urlExpr});\n  return response.json();`;
  }

  return `// @graphloom:node fetch\nasync function ${nodeSymbol(node)}(${params}): Promise<${returnType}> {\n${bodyLines}\n}\n`;
}

/**
 * Generates the code for a TransformNode.
 * Code shape per PARSER_RULES.md §2: plain function, tagged transform
 */
function generateTransformNode(
  node: GraphNode,
  incomingEdges: Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>,
  nodeMap: Map<string, GraphNode>
): string {
  const config = node.config as TransformNodeConfig;
  const params = node.inputs.map(port => {
    const tsType = portTypeToTS(port.type);
    return `${port.name}: ${tsType}`;
  }).join(", ");

  const outputType = node.outputs[0]?.type ?? "any";
  const returnType = portTypeToTS(outputType);

  // Use the config.body verbatim — per NODE_TYPES.md §3, body is captured/replayed as-is
  const body = config.body || "return undefined;";

  return `// @graphloom:node transform\nfunction ${nodeSymbol(node)}(${params}): ${returnType} {\n  ${body}\n}\n`;
}

/**
 * Generates the code for an OutputNode.
 * Code shape per PARSER_RULES.md §2: function tagged output
 */
function generateOutputNode(
  node: GraphNode,
  incomingEdges: Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>,
  nodeMap: Map<string, GraphNode>
): string {
  const inputType = node.inputs[0]?.type ?? "any";
  const tsType = portTypeToTS(inputType);
  const paramName = node.inputs[0]?.name ?? "value";

  return `// @graphloom:node output\nfunction ${nodeSymbol(node)}(${paramName}: ${tsType}) {\n  return ${paramName};\n}\n`;
}

/**
 * Generates the pipeline call site — the wiring that connects nodes via function calls.
 * Per PARSER_RULES.md §3: edges are reconstructed from call sites, not declarations.
 */
function generateCallSite(
  sortedNodes: GraphNode[],
  inputMap: Map<string, Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>>,
  nodeMap: Map<string, GraphNode>
): string {
  const lines: string[] = [];
  lines.push("// --- Pipeline execution ---");

  for (const node of sortedNodes) {
    if (node.kind === "input") {
      // Input nodes are already declared as const
      continue;
    }

    const incomingEdges = inputMap.get(node.id) ?? [];

    // Build the argument list from incoming edges
    // For each input port on this node, find which source node feeds it
    const args: string[] = [];
    for (const port of node.inputs) {
      const edge = incomingEdges.find(e => e.targetPortId === port.id);
      if (edge) {
        const sourceNode = nodeMap.get(edge.sourceNodeId);
        if (sourceNode) {
          if (sourceNode.kind === "input") {
            // Input nodes are referenced directly by their variable name
            args.push(nodeSymbol(sourceNode));
          } else {
            // Other nodes are referenced by their result variable
            args.push(`${nodeSymbol(sourceNode)}Result`);
          }
        }
      }
    }

    const sym = nodeSymbol(node);
    const callExpr = `${sym}(${args.join(", ")})`;

    if (node.kind === "output") {
      // Output is the terminal call
      lines.push(`const ${sym}Result = ${callExpr};`);
    } else if (node.kind === "fetch") {
      // Fetch nodes are async
      lines.push(`const ${sym}Result = await ${callExpr};`);
    } else {
      lines.push(`const ${sym}Result = ${callExpr};`);
    }
  }

  return lines.join("\n");
}

/**
 * graphToCode — v0: fresh-generation only
 *
 * Generates valid, tagged TypeScript source from a Graph.
 * The generated code follows PARSER_RULES.md §1 tagging conventions exactly.
 *
 * @param graph - The graph to generate code from
 * @returns { code, mapping } — the generated source code and a mapping from node IDs to AST locations
 */
export function graphToCode(graph: Graph): GraphToCodeResult {
  // Validate the graph first
  validateGraph(graph);

  // Build lookup structures
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const inputMap = buildInputMap(graph);

  // Topological sort (throws on cycles — per EDGE_CASES.md)
  const sortedIds = topologicalSort(
    graph.nodes.map(n => n.id),
    graph.edges
  );
  const sortedNodes = sortedIds.map(id => nodeMap.get(id)!);

  // Generate each node's declaration
  const declarations: string[] = [];
  const mapping: CodeMapping = { nodeToAst: {}, astToNode: {} };

  // Track running offset for mapping
  let currentOffset = 0;

  // Add a defineInput helper declaration at the top if we have input nodes
  const hasInputNodes = sortedNodes.some(n => n.kind === "input");
  if (hasInputNodes) {
    const helperCode = `/** GraphLoom runtime helper */\nfunction defineInput<T>(name: string, defaultValue?: T): T {\n  return defaultValue as T;\n}\n\n`;
    declarations.push(helperCode);
    currentOffset += helperCode.length;
  }

  // Generate declarations in topological order
  for (const node of sortedNodes) {
    const incomingEdges = inputMap.get(node.id) ?? [];
    let nodeCode: string;

    switch (node.kind) {
      case "input":
        nodeCode = generateInputNode(node);
        break;
      case "fetch":
        nodeCode = generateFetchNode(node, incomingEdges, nodeMap);
        break;
      case "transform":
        nodeCode = generateTransformNode(node, incomingEdges, nodeMap);
        break;
      case "output":
        nodeCode = generateOutputNode(node, incomingEdges, nodeMap);
        break;
      default:
        throw new Error(`Unknown node kind: ${(node as GraphNode).kind}`);
    }

    // Record mapping
    const sym = nodeSymbol(node);
    const start = currentOffset;
    const end = currentOffset + nodeCode.length;

    mapping.nodeToAst[node.id] = { symbol: sym, start, end };
    mapping.astToNode[sym] = node.id;

    declarations.push(nodeCode);
    currentOffset = end + 1; // +1 for the newline between declarations
  }

  // Generate the pipeline call site
  const callSite = generateCallSite(sortedNodes, inputMap, nodeMap);

  // Assemble the full source
  const code = declarations.join("\n") + "\n" + callSite + "\n";

  return { code, mapping };
}
