/**
 * codeToGraph — AST parse + edge inference
 *
 * Per PARSER_RULES.md:
 * 1. Recognize only @graphloom:node-tagged declarations.
 * 2. Apply per-kind parsing rules.
 * 3. Reconstruct edges from call-site arguments.
 * 4. Apply type-inference priority.
 * 5. Route anything that doesn't match into a passthrough region.
 */

import { SyntaxKind, VariableStatement, FunctionDeclaration, Node, Project } from "ts-morph";
import type {
  Graph,
  GraphNode,
  GraphEdge,
  CodeMapping,
  SyncSnapshot,
  Port,
  PortType,
} from "./types.js";
import { createProject, createSourceFile, tsToPortType } from "./astUtils.js";

export interface CodeToGraphResult {
  graph: Graph;
  mapping: CodeMapping;
  warnings: string[];
}

/**
 * Extracts the @graphloom:node kind from a node's leading comment ranges.
 * Returns the kind (e.g. "input", "fetch", "transform", "output") or null.
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
 * Infers a PortType from an initializer expression.
 */
function inferTypeFromInitializer(initializer: Node): PortType {
  const kind = initializer.getKind();
  switch (kind) {
    case SyntaxKind.NumericLiteral:
      return "number";
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return "string";
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
      return "boolean";
    case SyntaxKind.ObjectLiteralExpression:
      return "object";
    case SyntaxKind.ArrayLiteralExpression:
      return "array";
    default:
      return "any";
  }
}

/**
 * Strip outer curly braces from a function body string and trim.
 */
function getCleanBodyText(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * codeToGraph
 *
 * Parses a TS code string back into a Graph.
 *
 * @param code - The TS source code to parse
 * @param prevSnapshot - Optional previous snapshot for ID and position stability
 * @returns { graph, mapping, warnings }
 */
export function codeToGraph(code: string, prevSnapshot?: SyncSnapshot): CodeToGraphResult {
  const project = createProject();
  const sourceFile = createSourceFile(project, code);
  const warnings: string[] = [];

  const nodes: GraphNode[] = [];
  const mapping: CodeMapping = { nodeToAst: {}, astToNode: {} };

  // ID generator helper
  let idCounter = 1;
  const usedIds = new Set<string>();

  if (prevSnapshot) {
    for (const node of prevSnapshot.graph.nodes) {
      usedIds.add(node.id);
    }
  }

  function getUniqueId(symbol: string): string {
    // 1. Try to inherit from previous snapshot mapping
    if (prevSnapshot && prevSnapshot.mapping.astToNode[symbol]) {
      return prevSnapshot.mapping.astToNode[symbol];
    }
    // 2. Generate a stable-looking new ID
    let candidate = `node-${symbol}`;
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
    // 3. Fallback to sequence
    while (usedIds.has(`node-${idCounter}`)) {
      idCounter++;
    }
    candidate = `node-${idCounter}`;
    usedIds.add(candidate);
    return candidate;
  }

  // 1. Scan top-level statements for tagged nodes
  const statements = sourceFile.getStatements();
  const outputSymbols: string[] = [];

  for (const statement of statements) {
    const kindTag = getGraphLoomKind(statement);
    if (!kindTag) {
      // Untagged, goes to passthrough
      continue;
    }

    if (kindTag === "input") {
      // Must be a VariableStatement of the form: const x = defineInput<T>("name", defaultValue?)
      if (!Node.isVariableStatement(statement)) {
        warnings.push(`Statement tagged "input" is not a variable statement. Ignoring.`);
        continue;
      }
      const decls = statement.getDeclarations();
      if (decls.length !== 1) {
        warnings.push(`Input statement must have exactly one variable declaration. Ignoring.`);
        continue;
      }

      const decl = decls[0];
      const name = decl.getName();
      const init = decl.getInitializer();

      if (!init || !Node.isCallExpression(init) || init.getExpression().getText() !== "defineInput") {
        warnings.push(`Input variable "${name}" must be initialized with a "defineInput" call. Ignoring.`);
        continue;
      }

      // Parse generic type parameter T
      const typeArgs = init.getTypeArguments();
      let portType: PortType = "any";
      if (typeArgs.length === 1) {
        const typeText = typeArgs[0].getText();
        const typeResult = tsToPortType(typeText);
        portType = typeResult.type;
        if (typeResult.warning) {
          warnings.push(`Input "${name}": ${typeResult.warning}`);
        }
      } else {
        warnings.push(`Input "${name}" is missing explicit type argument. Falling back to "any".`);
      }

      // Parse label and defaultValue
      const args = init.getArguments();
      let label = name;
      if (args.length >= 1) {
        const labelArg = args[0];
        if (Node.isStringLiteral(labelArg)) {
          label = labelArg.getLiteralValue();
        }
      }

      const defaultValue = args.length >= 2 ? args[1].getText() : undefined;
      const config: Record<string, unknown> = {};
      if (defaultValue !== undefined) {
        // Evaluate default value literal safely if possible
        try {
          config.defaultValue = JSON.parse(defaultValue);
        } catch {
          config.defaultValue = defaultValue; // Store as raw string if complex
        }
      }

      const nodeId = getUniqueId(name);
      const span = getBlockSpan(statement);

      mapping.nodeToAst[nodeId] = { symbol: name, start: span.start, end: span.end };
      mapping.astToNode[name] = nodeId;

      // Position stability
      const prevNode = prevSnapshot?.graph.nodes.find(n => n.id === nodeId);
      const position = prevNode?.position ?? { x: 0, y: nodes.length * 150 };

      nodes.push({
        id: nodeId,
        kind: "input",
        label,
        inputs: [],
        outputs: [{ id: `${nodeId}_out`, name, type: portType }],
        config,
        position,
      });

    } else if (kindTag === "fetch") {
      // Must be an async function
      if (!Node.isFunctionDeclaration(statement)) {
        warnings.push(`Statement tagged "fetch" is not a function declaration. Ignoring.`);
        continue;
      }
      const name = statement.getName();
      if (!name) {
        warnings.push(`Anonymous function tagged "fetch" is not supported. Ignoring.`);
        continue;
      }
      if (!statement.isAsync()) {
        warnings.push(`Function "${name}" tagged "fetch" must be async. Ignoring.`);
        continue;
      }

      const nodeId = getUniqueId(name);

      // Parse input ports from parameters
      const inputs: Port[] = [];
      statement.getParameters().forEach((param, i) => {
        const paramName = param.getName();
        let portType: PortType = "any";

        const typeNode = param.getTypeNode();
        const initNode = param.getInitializer();

        if (typeNode) {
          const typeResult = tsToPortType(typeNode.getText());
          portType = typeResult.type;
          if (typeResult.warning) {
            warnings.push(`Fetch "${name}" parameter "${paramName}": ${typeResult.warning}`);
          }
        } else if (initNode) {
          portType = inferTypeFromInitializer(initNode);
        } else {
          warnings.push(`Fetch "${name}" parameter "${paramName}" is untyped. Falling back to "any".`);
        }

        inputs.push({
          id: `${nodeId}_in_${i}`,
          name: paramName,
          type: portType,
        });
      });

      // Parse output port from return type
      let outputType: PortType = "any";
      const returnTypeNode = statement.getReturnTypeNode();
      if (returnTypeNode) {
        let returnTypeText = returnTypeNode.getText();
        // Unwrap Promise<T>
        const promiseMatch = returnTypeText.match(/Promise\s*<\s*(.+)\s*>/);
        if (promiseMatch) {
          returnTypeText = promiseMatch[1];
        }
        const typeResult = tsToPortType(returnTypeText);
        outputType = typeResult.type;
        if (typeResult.warning) {
          warnings.push(`Fetch "${name}" return: ${typeResult.warning}`);
        }
      } else {
        warnings.push(`Fetch "${name}" has no explicit return type. Falling back to "any".`);
      }

      // Parse urlTemplate and method from body
      let urlTemplate = "";
      let method: "GET" | "POST" = "GET";

      const bodyText = statement.getBodyText() ?? "";
      // Simple regex extraction of fetch URL and method
      const fetchMatch = bodyText.match(/fetch\(\s*`([^`]+)`|'([^']+)'|"([^"]+)"/);
      if (fetchMatch) {
        urlTemplate = fetchMatch[1] || fetchMatch[2] || fetchMatch[3] || "";
      }

      const methodMatch = bodyText.match(/method:\s*["'](GET|POST)["']/i);
      if (methodMatch) {
        method = methodMatch[1].toUpperCase() as "GET" | "POST";
      }

      const span = getBlockSpan(statement);
      mapping.nodeToAst[nodeId] = { symbol: name, start: span.start, end: span.end };
      mapping.astToNode[name] = nodeId;

      const prevNode = prevSnapshot?.graph.nodes.find(n => n.id === nodeId);
      const position = prevNode?.position ?? { x: 0, y: nodes.length * 150 };

      nodes.push({
        id: nodeId,
        kind: "fetch",
        label: name,
        inputs,
        outputs: [{ id: `${nodeId}_out`, name: "result", type: outputType }],
        config: { urlTemplate, method },
        position,
      });

    } else if (kindTag === "transform") {
      // Must be a function declaration
      if (!Node.isFunctionDeclaration(statement)) {
        warnings.push(`Statement tagged "transform" is not a function declaration. Ignoring.`);
        continue;
      }
      const name = statement.getName();
      if (!name) {
        warnings.push(`Anonymous function tagged "transform" is not supported. Ignoring.`);
        continue;
      }
      if (statement.isAsync()) {
        warnings.push(`Function "${name}" tagged "transform" cannot be async. Ignoring.`);
        continue;
      }

      const nodeId = getUniqueId(name);

      // Parse input ports from parameters
      const inputs: Port[] = [];
      statement.getParameters().forEach((param, i) => {
        const paramName = param.getName();
        let portType: PortType = "any";

        const typeNode = param.getTypeNode();
        const initNode = param.getInitializer();

        if (typeNode) {
          const typeResult = tsToPortType(typeNode.getText());
          portType = typeResult.type;
          if (typeResult.warning) {
            warnings.push(`Transform "${name}" parameter "${paramName}": ${typeResult.warning}`);
          }
        } else if (initNode) {
          portType = inferTypeFromInitializer(initNode);
        } else {
          warnings.push(`Transform "${name}" parameter "${paramName}" is untyped. Falling back to "any".`);
        }

        inputs.push({
          id: `${nodeId}_in_${i}`,
          name: paramName,
          type: portType,
        });
      });

      // Parse output port from return type
      let outputType: PortType = "any";
      const returnTypeNode = statement.getReturnTypeNode();
      if (returnTypeNode) {
        const typeResult = tsToPortType(returnTypeNode.getText());
        outputType = typeResult.type;
        if (typeResult.warning) {
          warnings.push(`Transform "${name}" return: ${typeResult.warning}`);
        }
      } else {
        warnings.push(`Transform "${name}" has no explicit return type. Falling back to "any".`);
      }

      const rawBody = statement.getBody()?.getText() ?? "";
      const body = getCleanBodyText(rawBody);

      const span = getBlockSpan(statement);
      mapping.nodeToAst[nodeId] = { symbol: name, start: span.start, end: span.end };
      mapping.astToNode[name] = nodeId;

      const prevNode = prevSnapshot?.graph.nodes.find(n => n.id === nodeId);
      const position = prevNode?.position ?? { x: 0, y: nodes.length * 150 };

      nodes.push({
        id: nodeId,
        kind: "transform",
        label: name,
        inputs,
        outputs: [{ id: `${nodeId}_out`, name: "result", type: outputType }],
        config: { body },
        position,
      });

    } else if (kindTag === "output") {
      // Must be a function declaration
      if (!Node.isFunctionDeclaration(statement)) {
        warnings.push(`Statement tagged "output" is not a function declaration. Ignoring.`);
        continue;
      }
      const name = statement.getName();
      if (!name) {
        warnings.push(`Anonymous function tagged "output" is not supported. Ignoring.`);
        continue;
      }

      // Check for multiple output nodes (EDGE_CASES.md)
      outputSymbols.push(name);
      if (outputSymbols.length > 1) {
        throw new Error(
          `Graph has multiple output nodes — v1 graphs must have exactly one terminal. ` +
          `Found: [${outputSymbols.join(", ")}]`
        );
      }

      const nodeId = getUniqueId(name);

      // Parse input ports from parameters (must have exactly one)
      const inputs: Port[] = [];
      const params = statement.getParameters();
      if (params.length !== 1) {
        warnings.push(`Output "${name}" must have exactly 1 parameter. Ignoring.`);
        continue;
      }

      const param = params[0];
      const paramName = param.getName();
      let portType: PortType = "any";
      const typeNode = param.getTypeNode();
      if (typeNode) {
        const typeResult = tsToPortType(typeNode.getText());
        portType = typeResult.type;
        if (typeResult.warning) {
          warnings.push(`Output "${name}" parameter: ${typeResult.warning}`);
        }
      }

      inputs.push({
        id: `${nodeId}_in`,
        name: paramName,
        type: portType,
      });

      const span = getBlockSpan(statement);
      mapping.nodeToAst[nodeId] = { symbol: name, start: span.start, end: span.end };
      mapping.astToNode[name] = nodeId;

      const prevNode = prevSnapshot?.graph.nodes.find(n => n.id === nodeId);
      const position = prevNode?.position ?? { x: 0, y: nodes.length * 150 };

      nodes.push({
        id: nodeId,
        kind: "output",
        label: name,
        inputs,
        outputs: [],
        config: {},
        position,
      });

    } else {
      warnings.push(`Unrecognized @graphloom:node kind "${kindTag}". Ignoring.`);
    }
  }

  // 2. Reconstruct edges from call sites (PARSER_RULES.md §3)
  const edges: GraphEdge[] = [];
  let edgeCounter = 1;

  // Walk statements to find variable assignments of call expressions
  const variableToSourceNode: Record<string, string> = {};

  // Seed the map with Input nodes since they are declared directly as const variables
  for (const node of nodes) {
    if (node.kind === "input") {
      variableToSourceNode[node.label] = node.id;
    }
  }

  // Helper to extract CallExpression from initializers
  function getCallExpression(node: Node): any {
    if (Node.isCallExpression(node)) {
      return node;
    }
    if (Node.isAwaitExpression(node)) {
      const expr = node.getExpression();
      if (Node.isCallExpression(expr)) {
        return expr;
      }
    }
    return null;
  }

  // First pass: build mapping of variable name -> producing node ID
  for (const statement of statements) {
    if (Node.isVariableStatement(statement)) {
      for (const decl of statement.getDeclarations()) {
        const varName = decl.getName();
        const init = decl.getInitializer();
        if (init) {
          const call = getCallExpression(init);
          if (call) {
            const callee = call.getExpression().getText();
            const matchingNode = nodes.find(n => n.label === callee);
            if (matchingNode) {
              variableToSourceNode[varName] = matchingNode.id;
            }
          }
        }
      }
    }
  }

  // Second pass: reconstruct edges from all call sites
  for (const statement of statements) {
    // Find all call expressions inside the statement
    const callDescendants = statement.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callDescendants) {
      const callee = call.getExpression().getText();
      const targetNode = nodes.find(n => n.label === callee);
      if (!targetNode || targetNode.kind === "input") {
        // Not a node call or is input definition
        continue;
      }

      // Check args of call site
      const args = call.getArguments();
      args.forEach((arg, i) => {
        if (Node.isIdentifier(arg)) {
          const argName = arg.getText();
          const sourceNodeId = variableToSourceNode[argName];
          if (sourceNodeId) {
            const sourceNode = nodes.find(n => n.id === sourceNodeId);
            if (sourceNode) {
              const sourcePortId = sourceNode.outputs[0]?.id;
              const targetPortId = targetNode.inputs[i]?.id;

              if (sourcePortId && targetPortId) {
                edges.push({
                  id: `edge-${edgeCounter++}`,
                  source: { nodeId: sourceNodeId, portId: sourcePortId },
                  target: { nodeId: targetNode.id, portId: targetPortId },
                });
              }
            }
          }
        }
      });
    }
  }

  // Construct final graph version
  const version = prevSnapshot ? prevSnapshot.graphVersion + 1 : 1;

  return {
    graph: {
      id: prevSnapshot?.graph.id ?? "parsed-graph",
      nodes,
      edges,
      version,
    },
    mapping,
    warnings,
  };
}
