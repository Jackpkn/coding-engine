import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface Symbol {
  id: string;
  repo: string;
  path: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  nodeType: string;
  hash: string;
}

export class SymbolIndexer {
  private symbols = new Map<string, Symbol>();
  private nameIndex = new Map<string, Set<string>>(); // name -> symbol IDs
  private pathIndex = new Map<string, Set<string>>(); // path -> symbol IDs

  async buildIndex(repoPath: string): Promise<void> {
    console.log("Building symbol index for:", repoPath);

    // Use ctags for quick symbol extraction
    try {
      await this.runCtags(repoPath);
    } catch (error) {
      console.warn("ctags failed, falling back to basic indexing:", error);
      await this.fallbackIndexing(repoPath);
    }

    console.log(`Indexed ${this.symbols.size} symbols`);
  }

  async updateFile(filePath: string, content?: string): Promise<void> {
    // Remove existing symbols for this file
    const existingIds = this.pathIndex.get(filePath) || new Set();
    for (const id of existingIds) {
      this.removeSymbol(id);
    }

    // Re-index the file
    const fileContent = content || fs.readFileSync(filePath, "utf8");
    await this.indexSingleFile(filePath, fileContent);
  }

  private async runCtags(repoPath: string): Promise<void> {
    try {
      // Check if ctags is available
      execSync("which ctags", { stdio: "ignore" });

      const output = execSync(
        `ctags -x --language-force=Verilog --kinds-Verilog=+mfprtc ` +
          `--fields=+n --recurse "${repoPath}"`,
        { encoding: "utf8", cwd: repoPath }
      );

      this.parseCtagsOutput(output, repoPath);
    } catch (error) {
      throw new Error(`ctags execution failed: ${error}`);
    }
  }

  private parseCtagsOutput(output: string, repoPath: string): void {
    const lines = output.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      // ctags -x format: name kind line file description
      const parts = line.split(/\s+/);
      if (parts.length < 4) {
        continue;
      }

      const [name, kind, lineStr, ...fileParts] = parts;
      const lineNum = parseInt(lineStr, 10) - 1; // Convert to 0-based
      const relativePath = fileParts.join(" ").trim();
      const fullPath = path.resolve(repoPath, relativePath);

      const symbol: Symbol = {
        id: this.generateSymbolId(fullPath, name, lineNum),
        repo: repoPath,
        path: fullPath,
        name,
        kind: this.mapCtagsKind(kind),
        startLine: lineNum,
        endLine: lineNum, // ctags doesn't provide end line
        nodeType: kind,
        hash: this.computeHash(`${fullPath}:${name}:${lineNum}`),
      };

      this.addSymbol(symbol);
    }
  }

  private async fallbackIndexing(repoPath: string): Promise<void> {
    const verilogFiles = this.findVerilogFiles(repoPath);

    for (const filePath of verilogFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        await this.indexSingleFile(filePath, content);
      } catch (error) {
        console.warn(`Failed to index ${filePath}:`, error);
      }
    }
  }

  private async indexSingleFile(
    filePath: string,
    content: string
  ): Promise<void> {
    const lines = content.split("\n");

    // Simple regex-based symbol extraction
    const patterns = [
      { regex: /^\s*module\s+(\w+)/gm, kind: "module" },
      { regex: /^\s*function\s+(?:\w+\s+)?(\w+)/gm, kind: "function" },
      { regex: /^\s*task\s+(\w+)/gm, kind: "task" },
      {
        regex: /^\s*(?:input|output|inout)\s+(?:\w+\s+)?(\w+)/gm,
        kind: "port",
      },
      {
        regex: /^\s*(?:wire|reg|logic)\s+(?:\[.*?\]\s+)?(\w+)/gm,
        kind: "signal",
      },
      { regex: /^\s*(\w+)\s+(?:\#\(.*?\)\s+)?(\w+)\s*\(/gm, kind: "instance" },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const name = match[1];
        const lineNum =
          content.substring(0, match.index).split("\n").length - 1;

        const symbol: Symbol = {
          id: this.generateSymbolId(filePath, name, lineNum),
          repo: path.dirname(filePath),
          path: path.resolve(filePath),
          name,
          kind: pattern.kind,
          startLine: lineNum,
          endLine: lineNum,
          nodeType: pattern.kind,
          hash: this.computeHash(`${filePath}:${name}:${lineNum}`),
        };

        this.addSymbol(symbol);
      }
    }
  }

  private addSymbol(symbol: Symbol): void {
    this.symbols.set(symbol.id, symbol);

    // Update name index
    if (!this.nameIndex.has(symbol.name)) {
      this.nameIndex.set(symbol.name, new Set());
    }
    this.nameIndex.get(symbol.name)!.add(symbol.id);

    // Update path index
    if (!this.pathIndex.has(symbol.path)) {
      this.pathIndex.set(symbol.path, new Set());
    }
    this.pathIndex.get(symbol.path)!.add(symbol.id);
  }

  private removeSymbol(symbolId: string): void {
    const symbol = this.symbols.get(symbolId);
    if (!symbol) {
      return;
    }

    this.symbols.delete(symbolId);

    // Update name index
    const nameSet = this.nameIndex.get(symbol.name);
    if (nameSet) {
      nameSet.delete(symbolId);
      if (nameSet.size === 0) {
        this.nameIndex.delete(symbol.name);
      }
    }

    // Update path index
    const pathSet = this.pathIndex.get(symbol.path);
    if (pathSet) {
      pathSet.delete(symbolId);
      if (pathSet.size === 0) {
        this.pathIndex.delete(symbol.path);
      }
    }
  }

  findByName(name: string): Symbol[] {
    const ids = this.nameIndex.get(name) || new Set();
    return Array.from(ids)
      .map((id) => this.symbols.get(id)!)
      .filter(Boolean);
  }

  listSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }

  getSymbol(id: string): Symbol | undefined {
    return this.symbols.get(id);
  }

  getSymbolCount(): number {
    return this.symbols.size;
  }

  // New methods for file fetching
  getFilesBySymbol(symbolName: string): string[] {
    const symbols = this.findByName(symbolName);
    const files = new Set<string>();

    for (const symbol of symbols) {
      files.add(symbol.path);
    }

    return Array.from(files);
  }

  getSymbolsInFile(filePath: string): Symbol[] {
    const ids = this.pathIndex.get(filePath) || new Set();
    return Array.from(ids)
      .map((id) => this.symbols.get(id)!)
      .filter(Boolean);
  }

  getAllFiles(): string[] {
    return Array.from(this.pathIndex.keys());
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

  private mapCtagsKind(kind: string): string {
    const mapping: { [key: string]: string } = {
      m: "module",
      f: "function",
      t: "task",
      p: "port",
      r: "register",
      c: "constant",
    };
    return mapping[kind] || kind;
  }

  private generateSymbolId(
    filePath: string,
    name: string,
    line: number
  ): string {
    return `${path.basename(filePath)}:${name}:${line}`;
  }

  private computeHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString();
  }
}
