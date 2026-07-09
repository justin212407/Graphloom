/**
 * graphToCode — AST patch-or-generate
 *
 * Per SYNC_ENGINE.md §1:
 * Naive approach (what to avoid): stringify the graph into a fresh code file every time.
 * GraphLoom's approach: patch, don't regenerate.
 */

import type {
  Graph,
  GraphNode,
  GraphEdge,
  CodeMapping,
  SyncSnapshot,
  Port,
} from "./types.js";
import {
  createProject,
  createSourceFile,
  printSourceFile,
  portTypeToTS,
  topologicalSort,
} from "./astUtils.js";
import { Node, SyntaxKind } from "ts-morph";

export interface GraphToCodeResult {
  code: string;
  mapping: CodeMapping;
}

const CALL_SITE_MARKER = "// --- Pipeline execution ---";

/**
 * Validates a graph before code generation.
 * Checks for: cyclic graphs, multiple output nodes, multiple edges into one input port.
 */
function validateGraph(graph: Graph): void {
  const outputNodes = graph.nodes.filter(n => n.kind === "output");
  if (outputNodes.length > 1) {
    throw new Error(
      `Graph has ${outputNodes.length} output nodes — v1 graphs must have exactly one terminal. ` +
      `Found: [${outputNodes.map(n => n.id).join(", ")}]`
    );
  }

  const targetPorts = new Map<string, string>();
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
}

/**
 * Helper to check if two port lists are identical structurally.
 */
function arePortsEqual(a: Port[], b: Port[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].type !== b[i].type) {
      return false;
    }
  }
  return true;
}

/**
 * Helper to check if node configs are identical.
 */
function areConfigsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Extracts the @graphloom:node kind from a statement's leading comment ranges.
 */
function getGraphLoomKind(node: Node): string | null {
  const ranges = node.getLeadingCommentRanges();
  for (const range of ranges) {
    const text = range.getText();
    const match = text.match(/@graphloom:node\s+(\w+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Gets the actual character span of the block including its leading comments.
 */
function getBlockSpan(node: Node): { start: number; end: number } {
  const ranges = node.getLeadingCommentRanges();
  const start = ranges.length > 0 ? ranges[0].getPos() : node.getStart();
  const end = node.getEnd();
  return { start, end };
}

/**
 * Helper to find a declaration by its symbol name in a SourceFile.
 */
function getDeclarationBySymbol(sourceFile: any, symbol: string): Node | null {
  const func = sourceFile.getFunction(symbol);
  if (func) return func;
  const varDecl = sourceFile.getVariableDeclaration(symbol);
  if (varDecl) {
    return varDecl.getVariableStatement() ?? null;
  }
  return null;
}

/**
 * Builds a lookup of incoming edges per target node.
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

function nodeSymbol(node: GraphNode): string {
  return node.label;
}

/**
 * Generates declaration code for each node kind.
 */
function generateNodeDeclaration(node: GraphNode): string {
  const sym = nodeSymbol(node);
  switch (node.kind) {
    case "input": {
      const outputType = node.outputs[0]?.type ?? "any";
      const tsType = portTypeToTS(outputType);
      const defaultVal = (node.config as { defaultValue?: unknown }).defaultValue;
      const defaultArg = defaultVal !== undefined ? `, ${JSON.stringify(defaultVal)}` : "";
      return `// @graphloom:node input\nconst ${sym} = defineInput<${tsType}>("${node.label}"${defaultArg});`;
    }
    case "fetch": {
      const config = node.config as { urlTemplate: string; method?: string };
      const params = node.inputs.map(p => `${p.name}: ${portTypeToTS(p.type)}`).join(", ");
      const returnType = portTypeToTS(node.outputs[0]?.type ?? "any");
      const urlExpr = `\`${config.urlTemplate}\``;
      const methodStr = config.method ?? "GET";
      
      let bodyLines: string;
      if (methodStr === "POST") {
        bodyLines = `  const response = await fetch(${urlExpr}, {\n    method: "${methodStr}",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ ${node.inputs.map(p => p.name).join(", ")} }),\n  });\n  return response.json();`;
      } else {
        bodyLines = `  const response = await fetch(${urlExpr});\n  return response.json();`;
      }
      return `// @graphloom:node fetch\nasync function ${sym}(${params}): Promise<${returnType}> {\n${bodyLines}\n}`;
    }
    case "transform": {
      const config = node.config as { body: string };
      const params = node.inputs.map(p => `${p.name}: ${portTypeToTS(p.type)}`).join(", ");
      const returnType = portTypeToTS(node.outputs[0]?.type ?? "any");
      const body = config.body || "return undefined;";
      return `// @graphloom:node transform\nfunction ${sym}(${params}): ${returnType} {\n  ${body}\n}`;
    }
    case "output": {
      const inputType = portTypeToTS(node.inputs[0]?.type ?? "any");
      const paramName = node.inputs[0]?.name ?? "value";
      return `// @graphloom:node output\nfunction ${sym}(${paramName}: ${inputType}) {\n  return ${paramName};\n}`;
    }
  }
}

/**
 * Generates the call site block.
 */
function generateCallSiteBlock(
  sortedNodes: GraphNode[],
  inputMap: Map<string, Array<{ sourceNodeId: string; sourcePortId: string; targetPortId: string }>>,
  nodeMap: Map<string, GraphNode>
): string {
  const lines: string[] = [CALL_SITE_MARKER];
  for (const node of sortedNodes) {
    if (node.kind === "input") continue;

    const incomingEdges = inputMap.get(node.id) ?? [];
    const args: string[] = [];

    for (const port of node.inputs) {
      const edge = incomingEdges.find(e => e.targetPortId === port.id);
      if (edge) {
        const sourceNode = nodeMap.get(edge.sourceNodeId);
        if (sourceNode) {
          if (sourceNode.kind === "input") {
            args.push(nodeSymbol(sourceNode));
          } else {
            args.push(`${nodeSymbol(sourceNode)}Result`);
          }
        }
      }
    }

    const sym = nodeSymbol(node);
    const callExpr = `${sym}(${args.join(", ")})`;
    if (node.kind === "output") {
      lines.push(`const ${sym}Result = ${callExpr};`);
    } else if (node.kind === "fetch") {
      lines.push(`const ${sym}Result = await ${callExpr};`);
    } else {
      lines.push(`const ${sym}Result = ${callExpr};`);
    }
  }
  return lines.join("\n");
}

/**
 * graphToCode
 *
 * Generates or patches TypeScript source representing the Graph.
 *
 * @param graph - Current Graph state
 * @param prevSnapshot - Optional previous sync snapshot to enable patch-in-place
 * @returns { code, mapping }
 */
export function graphToCode(graph: Graph, prevSnapshot?: SyncSnapshot): GraphToCodeResult {
  validateGraph(graph);

  // Topological sort of current graph
  const sortedIds = topologicalSort(
    graph.nodes.map(n => n.id),
    graph.edges
  );
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }
  const sortedNodes = sortedIds.map(id => nodeMap.get(id)!);
  const inputMap = buildInputMap(graph);

  // Fresh Generation Path
  if (!prevSnapshot || !prevSnapshot.code) {
    const declarations: string[] = [];
    const mapping: CodeMapping = { nodeToAst: {}, astToNode: {} };
    let currentOffset = 0;

    const hasInputNodes = sortedNodes.some(n => n.kind === "input");
    if (hasInputNodes) {
      const helper = `/** GraphLoom runtime helper */\nfunction defineInput<T>(name: string, defaultValue?: T): T {\n  return defaultValue as T;\n}\n\n`;
      declarations.push(helper);
      currentOffset += helper.length;
    }

    for (const node of sortedNodes) {
      const nodeDecl = generateNodeDeclaration(node) + "\n";
      const sym = nodeSymbol(node);
      const start = currentOffset;
      const end = currentOffset + nodeDecl.length;

      mapping.nodeToAst[node.id] = { symbol: sym, start, end };
      mapping.astToNode[sym] = node.id;

      declarations.push(nodeDecl);
      currentOffset = end + 1; // account for extra newline
    }

    const callSite = generateCallSiteBlock(sortedNodes, inputMap, nodeMap);
    const code = declarations.join("\n") + "\n" + callSite + "\n";

    return { code, mapping };
  }

  // Patch-In-Place Path (Day 2 upgrade)
  const markerIndex = prevSnapshot.code.indexOf(CALL_SITE_MARKER);
  const declarationsCode = markerIndex !== -1
    ? prevSnapshot.code.substring(0, markerIndex).trim()
    : prevSnapshot.code;

  const project = createProject();
  const sourceFile = createSourceFile(project, declarationsCode);

  // 1. Delete nodes that are no longer in the graph
  const currentIds = new Set(graph.nodes.map(n => n.id));
  for (const prevNode of prevSnapshot.graph.nodes) {
    if (!currentIds.has(prevNode.id)) {
      const prevSymbol = prevSnapshot.mapping.nodeToAst[prevNode.id]?.symbol;
      if (prevSymbol) {
        const declNode = getDeclarationBySymbol(sourceFile, prevSymbol);
        if (declNode) {
          declNode.remove();
        }
      }
    }
  }

  // 2. Add or update node declarations
  for (const node of sortedNodes) {
    const prevNode = prevSnapshot.graph.nodes.find(n => n.id === node.id);
    const newDeclText = generateNodeDeclaration(node);

    if (prevNode) {
      const prevSymbol = prevSnapshot.mapping.nodeToAst[node.id]?.symbol;
      const portsChanged = !arePortsEqual(prevNode.inputs, node.inputs) || !arePortsEqual(prevNode.outputs, node.outputs);
      const configChanged = !areConfigsEqual(prevNode.config, node.config) || prevNode.label !== node.label;

      if (portsChanged || configChanged) {
        if (prevSymbol) {
          const declNode = getDeclarationBySymbol(sourceFile, prevSymbol);
          if (declNode) {
            // Replace the subtree verbatim, preserving spacing/comments around it
            declNode.replaceWithText(newDeclText);
          } else {
            sourceFile.addStatements("\n" + newDeclText);
          }
        } else {
          sourceFile.addStatements("\n" + newDeclText);
        }
      }
    } else {
      // New node, append to the declaration list
      sourceFile.addStatements("\n" + newDeclText);
    }
  }

  // 3. Assemble and print final code
  const callSiteBlock = generateCallSiteBlock(sortedNodes, inputMap, nodeMap);
  const finalCode = sourceFile.getFullText().trim() + "\n\n" + callSiteBlock + "\n";

  // Reconstruct mapping
  const finalProject = createProject();
  const finalSourceFile = createSourceFile(finalProject, finalCode);
  const mapping: CodeMapping = { nodeToAst: {}, astToNode: {} };

  const finalStatements = finalSourceFile.getStatements();
  for (const stmt of finalStatements) {
    const kindTag = getGraphLoomKind(stmt);
    if (!kindTag) continue;

    let symbol = "";
    if (Node.isVariableStatement(stmt)) {
      symbol = stmt.getDeclarations()[0]?.getName() ?? "";
    } else if (Node.isFunctionDeclaration(stmt)) {
      symbol = stmt.getName() ?? "";
    }

    if (symbol) {
      // Find matching nodeId
      const matchingNode = graph.nodes.find(n => nodeSymbol(n) === symbol);
      if (matchingNode) {
        const span = getBlockSpan(stmt);
        mapping.nodeToAst[matchingNode.id] = { symbol, start: span.start, end: span.end };
        mapping.astToNode[symbol] = matchingNode.id;
      }
    }
  }

  return { code: finalCode, mapping };
}
