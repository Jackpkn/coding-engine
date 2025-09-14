import { ModuleInfo, PortInfo } from "./parserManager";

export interface ModuleNode {
  id: string;
  name: string;
  file: string;
  ports: PortInfo[];
  parameters: { [key: string]: string };
  instances: InstanceInfo[];
}

export interface InstanceInfo {
  name: string;
  moduleType: string;
  connections: ConnectionInfo[];
  file: string;
  line: number;
}

export interface ConnectionInfo {
  portName: string;
  signalName: string;
  direction: "input" | "output" | "inout";
}

export interface SignalFlow {
  from: { module: string; port: string };
  to: { module: string; port: string };
  signal: string;
  path: string[];
}

export interface ModuleGraph {
  nodes: Map<string, ModuleNode>;
  edges: Map<string, Set<string>>; // module -> instantiated modules
  reverseEdges: Map<string, Set<string>>; // module -> modules that instantiate it
  signalFlows: SignalFlow[];
}

export class GraphBuilder {
  private graph: ModuleGraph;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
      signalFlows: [],
    };
  }

  buildGraph(modules: ModuleInfo[], instances: InstanceInfo[]): ModuleGraph {
    console.log(
      `Building module graph: ${modules.length} modules, ${instances.length} instances`
    );

    // Clear previous graph
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
      signalFlows: [],
    };

    // Add module nodes
    for (const module of modules) {
      const node: ModuleNode = {
        id: module.name,
        name: module.name,
        file: module.filePath,
        ports: module.ports,
        parameters: {},
        instances: [],
      };
      this.graph.nodes.set(module.name, node);
    }

    // Add instances and build edges
    for (const instance of instances) {
      const parentModule = this.findModuleByFile(instance.file, modules);
      if (parentModule) {
        // Add instance to parent module
        const parentNode = this.graph.nodes.get(parentModule.name);
        if (parentNode) {
          parentNode.instances.push(instance);
        }

        // Build instantiation edge
        this.addEdge(parentModule.name, instance.moduleType);
      }
    }

    // Build signal flow graph
    this.buildSignalFlows();

    console.log(
      `Graph built: ${
        this.graph.nodes.size
      } nodes, ${this.getTotalEdges()} edges`
    );
    return this.graph;
  }

  private findModuleByFile(
    file: string,
    modules: ModuleInfo[]
  ): ModuleInfo | null {
    return modules.find((m) => m.filePath === file) || null;
  }

  private addEdge(from: string, to: string): void {
    // Forward edge
    if (!this.graph.edges.has(from)) {
      this.graph.edges.set(from, new Set());
    }
    this.graph.edges.get(from)!.add(to);

    // Reverse edge
    if (!this.graph.reverseEdges.has(to)) {
      this.graph.reverseEdges.set(to, new Set());
    }
    this.graph.reverseEdges.get(to)!.add(from);
  }

  private buildSignalFlows(): void {
    // Analyze signal connections between modules
    for (const [moduleName, node] of this.graph.nodes) {
      for (const instance of node.instances) {
        for (const connection of instance.connections) {
          // Find signal flows through this connection
          const flow = this.traceSignalFlow(moduleName, instance, connection);
          if (flow) {
            this.graph.signalFlows.push(flow);
          }
        }
      }
    }
  }

  private traceSignalFlow(
    parentModule: string,
    instance: InstanceInfo,
    connection: ConnectionInfo
  ): SignalFlow | null {
    const childModule = this.graph.nodes.get(instance.moduleType);
    if (!childModule) {
      return null;
    }

    const childPort = childModule.ports.find(
      (p) => p.name === connection.portName
    );
    if (!childPort) {
      return null;
    }

    return {
      from: {
        module:
          connection.direction === "input" ? parentModule : instance.moduleType,
        port:
          connection.direction === "input"
            ? connection.signalName
            : connection.portName,
      },
      to: {
        module:
          connection.direction === "input" ? instance.moduleType : parentModule,
        port:
          connection.direction === "input"
            ? connection.portName
            : connection.signalName,
      },
      signal: connection.signalName,
      path: [parentModule, instance.moduleType],
    };
  }

  // Graph analysis methods
  getModuleHierarchy(): { [module: string]: string[] } {
    const hierarchy: { [module: string]: string[] } = {};

    for (const [module, children] of this.graph.edges) {
      hierarchy[module] = Array.from(children);
    }

    return hierarchy;
  }

  getTopLevelModules(): string[] {
    const topLevel: string[] = [];

    for (const moduleName of this.graph.nodes.keys()) {
      const parents = this.graph.reverseEdges.get(moduleName);
      if (!parents || parents.size === 0) {
        topLevel.push(moduleName);
      }
    }

    return topLevel;
  }

  getLeafModules(): string[] {
    const leaves: string[] = [];

    for (const moduleName of this.graph.nodes.keys()) {
      const children = this.graph.edges.get(moduleName);
      if (!children || children.size === 0) {
        leaves.push(moduleName);
      }
    }

    return leaves;
  }

  findModulePath(from: string, to: string): string[] | null {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string, target: string): boolean => {
      if (current === target) {
        path.push(current);
        return true;
      }

      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      path.push(current);

      const children = this.graph.edges.get(current);
      if (children) {
        for (const child of children) {
          if (dfs(child, target)) {
            return true;
          }
        }
      }

      path.pop();
      return false;
    };

    return dfs(from, to) ? path : null;
  }

  getSignalImpactAnalysis(signalName: string): {
    sources: Array<{ module: string; port: string }>;
    sinks: Array<{ module: string; port: string }>;
    affectedModules: string[];
  } {
    const sources: Array<{ module: string; port: string }> = [];
    const sinks: Array<{ module: string; port: string }> = [];
    const affectedModules = new Set<string>();

    for (const flow of this.graph.signalFlows) {
      if (flow.signal === signalName) {
        sources.push(flow.from);
        sinks.push(flow.to);
        affectedModules.add(flow.from.module);
        affectedModules.add(flow.to.module);
      }
    }

    return {
      sources,
      sinks,
      affectedModules: Array.from(affectedModules),
    };
  }

  getCriticalPath(): string[] {
    // Find the longest path in the module hierarchy
    const visited = new Set<string>();
    let longestPath: string[] = [];

    const dfs = (module: string, currentPath: string[]): void => {
      if (visited.has(module)) {
        return;
      }

      visited.add(module);
      currentPath.push(module);

      const children = this.graph.edges.get(module);
      if (!children || children.size === 0) {
        // Leaf node - check if this is the longest path
        if (currentPath.length > longestPath.length) {
          longestPath = [...currentPath];
        }
      } else {
        for (const child of children) {
          dfs(child, currentPath);
        }
      }

      currentPath.pop();
      visited.delete(module);
    };

    // Start from all top-level modules
    for (const topModule of this.getTopLevelModules()) {
      dfs(topModule, []);
    }

    return longestPath;
  }

  getModuleComplexity(moduleName: string): {
    instanceCount: number;
    portCount: number;
    connectionCount: number;
    hierarchyDepth: number;
  } {
    const node = this.graph.nodes.get(moduleName);
    if (!node) {
      return {
        instanceCount: 0,
        portCount: 0,
        connectionCount: 0,
        hierarchyDepth: 0,
      };
    }

    const connectionCount = node.instances.reduce(
      (sum, inst) => sum + inst.connections.length,
      0
    );
    const hierarchyDepth = this.calculateHierarchyDepth(moduleName);

    return {
      instanceCount: node.instances.length,
      portCount: node.ports.length,
      connectionCount,
      hierarchyDepth,
    };
  }

  private calculateHierarchyDepth(moduleName: string): number {
    const visited = new Set<string>();

    const dfs = (module: string): number => {
      if (visited.has(module)) {
        return 0;
      }
      visited.add(module);

      const children = this.graph.edges.get(module);
      if (!children || children.size === 0) {
        return 1;
      }

      let maxDepth = 0;
      for (const child of children) {
        maxDepth = Math.max(maxDepth, dfs(child));
      }

      return maxDepth + 1;
    };

    return dfs(moduleName);
  }

  private getTotalEdges(): number {
    let total = 0;
    for (const edges of this.graph.edges.values()) {
      total += edges.size;
    }
    return total;
  }

  // Export graph for visualization
  exportToDot(): string {
    let dot = "digraph ModuleHierarchy {\n";
    dot += "  rankdir=TB;\n";
    dot += "  node [shape=box, style=rounded];\n\n";

    // Add nodes
    for (const [name, node] of this.graph.nodes) {
      const label = `${name}\\n(${node.instances.length} instances, ${node.ports.length} ports)`;
      dot += `  "${name}" [label="${label}"];\n`;
    }

    dot += "\n";

    // Add edges
    for (const [from, children] of this.graph.edges) {
      for (const to of children) {
        dot += `  "${from}" -> "${to}";\n`;
      }
    }

    dot += "}\n";
    return dot;
  }

  getGraph(): ModuleGraph {
    return this.graph;
  }
}
