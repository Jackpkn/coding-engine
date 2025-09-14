import * as fs from "fs";
import * as path from "path";
import { Parser } from "web-tree-sitter";
import { loadVerilogParserNew } from "../verilogParser";

export interface ParseResult {
  filesIndexed: number;
  modules: ModuleInfo[];
}

export interface ModuleInfo {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  ports: PortInfo[];
}

export interface PortInfo {
  name: string;
  direction: string;
  type: string;
}

export interface FileCache {
  hash: string;
  tree: any;
  modules: ModuleInfo[];
  lastModified: number;
}

export class ParserManager {
  private parser: InstanceType<typeof Parser> | null = null;
  private fileCache = new Map<string, FileCache>();
  private wasmPath: string;

  constructor(wasmPath: string) {
    this.wasmPath = wasmPath;
  }

  async initialize(): Promise<void> {
    if (!this.parser) {
      const { parser } = await loadVerilogParserNew(this.wasmPath);
      this.parser = parser;
      console.log("ParserManager initialized");
    }
  }

  async indexRepo(repoPath: string): Promise<ParseResult> {
    await this.initialize();

    const verilogFiles = this.findVerilogFiles(repoPath);
    const allModules: ModuleInfo[] = [];
    let filesIndexed = 0;

    for (const filePath of verilogFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const result = await this.parseFile(filePath, content);
        allModules.push(...result.modules);
        filesIndexed++;
      } catch (error) {
        console.warn(`Failed to parse ${filePath}:`, error);
      }
    }

    return { filesIndexed, modules: allModules };
  }

  async updateFile(
    filePath: string,
    content?: string
  ): Promise<{ modules: ModuleInfo[] }> {
    await this.initialize();

    const fileContent = content || fs.readFileSync(filePath, "utf8");
    const result = await this.parseFile(filePath, fileContent);

    return { modules: result.modules };
  }

  async parseFile(
    filePath: string,
    content: string
  ): Promise<{ modules: ModuleInfo[] }> {
    if (!this.parser) {
      throw new Error("Parser not initialized");
    }

    const hash = this.computeHash(content);
    const cached = this.fileCache.get(filePath);

    if (cached && cached.hash === hash) {
      return { modules: cached.modules };
    }

    const tree = this.parser.parse(content);
    const modules = this.extractModules(tree, filePath, content);

    this.fileCache.set(filePath, {
      hash,
      tree,
      modules,
      lastModified: Date.now(),
    });

    return { modules };
  }

  getNodes(filePath: string, nodeType?: string): any[] {
    const cached = this.fileCache.get(filePath);
    if (!cached) {
      return [];
    }

    if (!nodeType) {
      return [cached.tree.rootNode];
    }

    return cached.tree.rootNode.descendantsOfType(nodeType) || [];
  }

  private findVerilogFiles(repoPath: string): string[] {
    const files: string[] = [];
    const extensions = [".v", ".sv", ".svh", ".vh"];

    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip common ignore patterns
            if (
              !["node_modules", ".git", "build", "dist"].includes(entry.name)
            ) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.warn(`Cannot read directory ${dir}:`, error);
      }
    };

    walk(repoPath);
    return files;
  }

  private extractModules(
    tree: any,
    filePath: string,
    content: string
  ): ModuleInfo[] {
    const modules: ModuleInfo[] = [];
    const lines = content.split("\n");

    // Try different node types for SystemVerilog
    const moduleTypes = [
      "module_declaration",
      "module_header",
      "module_nonansi_header",
      "module_ansi_header",
    ];
    let moduleNodes: any[] = [];

    for (const nodeType of moduleTypes) {
      const nodes = tree.rootNode.descendantsOfType(nodeType) || [];
      moduleNodes.push(...nodes);
    }

    // Fallback: look for any node containing "module" in its type
    if (moduleNodes.length === 0) {
      const allNodes = this.getAllDescendants(tree.rootNode);
      moduleNodes = allNodes.filter(
        (node) => node.type && node.type.toLowerCase().includes("module")
      );
    }

    for (const moduleNode of moduleNodes) {
      let nameNode =
        moduleNode.childForFieldName("name") ||
        moduleNode.childForFieldName("module_name") ||
        moduleNode.childForFieldName("identifier");

      // If no field name, look for identifier children
      if (!nameNode) {
        const identifiers =
          moduleNode.descendantsOfType("simple_identifier") || [];
        nameNode = identifiers[0]; // First identifier is usually the module name
      }

      if (!nameNode) {
        continue;
      }

      const moduleName = nameNode.text;
      const startLine = this.getLineNumber(content, moduleNode.startIndex);
      const endLine = this.getLineNumber(content, moduleNode.endIndex);

      const ports = this.extractPorts(moduleNode);

      modules.push({
        name: moduleName,
        filePath: path.resolve(filePath),
        startLine,
        endLine,
        ports,
      });
    }

    return modules;
  }

  private extractPorts(moduleNode: any): PortInfo[] {
    const ports: PortInfo[] = [];
    const portNodes =
      moduleNode.descendantsOfType("ansi_port_declaration") || [];

    for (const portNode of portNodes) {
      const dirNode = portNode.descendantsOfType("port_direction")[0];
      const typeNode = portNode.descendantsOfType("net_type")[0];
      const nameNode = portNode.childForFieldName("port_name");

      if (nameNode) {
        ports.push({
          name: nameNode.text,
          direction: dirNode?.text || "",
          type: typeNode?.text || "wire",
        });
      }
    }

    return ports;
  }

  private getAllDescendants(node: any): any[] {
    const descendants: any[] = [];

    function traverse(n: any) {
      descendants.push(n);
      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    }

    traverse(node);
    return descendants;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split("\n").length - 1;
  }

  private computeHash(content: string): string {
    // Simple hash function - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }
}
