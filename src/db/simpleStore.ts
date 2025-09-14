import * as fs from "fs";
import * as path from "path";

export interface SymbolRecord {
  id: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  signature?: string;
  hash: string;
  repoPath: string;
  lastModified: number;
}

export interface ModuleRecord {
  id: string;
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  ports: string; // JSON string
  parameters: string; // JSON string
  hash: string;
  repoPath: string;
  lastModified: number;
}

export interface ConnectionRecord {
  id: string;
  fromModule: string;
  toModule: string;
  fromPort: string;
  toPort: string;
  signalName: string;
  repoPath: string;
}

export class SimpleStore {
  private dbPath: string;
  private symbols = new Map<string, SymbolRecord>();
  private modules = new Map<string, ModuleRecord>();
  private connections = new Map<string, ConnectionRecord>();
  private fileMetadata = new Map<
    string,
    { hash: string; lastModified: number }
  >();

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), ".verilog-cache");
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }

    // Load existing data
    await this.loadData();
    console.log(`Simple store initialized: ${this.dbPath}`);
  }

  private async loadData(): Promise<void> {
    try {
      const symbolsFile = path.join(this.dbPath, "symbols.json");
      const modulesFile = path.join(this.dbPath, "modules.json");
      const connectionsFile = path.join(this.dbPath, "connections.json");
      const metadataFile = path.join(this.dbPath, "metadata.json");

      if (fs.existsSync(symbolsFile)) {
        const data = JSON.parse(fs.readFileSync(symbolsFile, "utf8"));
        this.symbols = new Map(data);
      }

      if (fs.existsSync(modulesFile)) {
        const data = JSON.parse(fs.readFileSync(modulesFile, "utf8"));
        this.modules = new Map(data);
      }

      if (fs.existsSync(connectionsFile)) {
        const data = JSON.parse(fs.readFileSync(connectionsFile, "utf8"));
        this.connections = new Map(data);
      }

      if (fs.existsSync(metadataFile)) {
        const data = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
        this.fileMetadata = new Map(data);
      }
    } catch (error) {
      console.warn("Failed to load existing data:", error);
    }
  }

  private async saveData(): Promise<void> {
    try {
      const symbolsFile = path.join(this.dbPath, "symbols.json");
      const modulesFile = path.join(this.dbPath, "modules.json");
      const connectionsFile = path.join(this.dbPath, "connections.json");
      const metadataFile = path.join(this.dbPath, "metadata.json");

      fs.writeFileSync(
        symbolsFile,
        JSON.stringify(Array.from(this.symbols.entries()))
      );
      fs.writeFileSync(
        modulesFile,
        JSON.stringify(Array.from(this.modules.entries()))
      );
      fs.writeFileSync(
        connectionsFile,
        JSON.stringify(Array.from(this.connections.entries()))
      );
      fs.writeFileSync(
        metadataFile,
        JSON.stringify(Array.from(this.fileMetadata.entries()))
      );
    } catch (error) {
      console.error("Failed to save data:", error);
    }
  }

  // Symbol operations
  async insertSymbols(symbols: SymbolRecord[]): Promise<void> {
    for (const symbol of symbols) {
      this.symbols.set(symbol.id, symbol);
    }
    await this.saveData();
  }

  async searchSymbols(
    query: string,
    repoPath: string,
    limit = 100
  ): Promise<SymbolRecord[]> {
    const results: SymbolRecord[] = [];
    const lowerQuery = query.toLowerCase();

    for (const symbol of this.symbols.values()) {
      if (symbol.repoPath === repoPath) {
        if (
          symbol.name.toLowerCase().includes(lowerQuery) ||
          (symbol.signature &&
            symbol.signature.toLowerCase().includes(lowerQuery))
        ) {
          results.push(symbol);
          if (results.length >= limit) {
            break;
          }
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerQuery ? 1 : 0;
      const bExact = b.name.toLowerCase() === lowerQuery ? 1 : 0;
      if (aExact !== bExact) {
        return bExact - aExact;
      }

      const aStarts = a.name.toLowerCase().startsWith(lowerQuery) ? 1 : 0;
      const bStarts = b.name.toLowerCase().startsWith(lowerQuery) ? 1 : 0;
      if (aStarts !== bStarts) {
        return bStarts - aStarts;
      }

      return a.name.localeCompare(b.name);
    });

    return results;
  }

  // Module operations
  async insertModules(modules: ModuleRecord[]): Promise<void> {
    for (const module of modules) {
      this.modules.set(module.id, module);
    }
    await this.saveData();
  }

  async getModuleHierarchy(
    repoPath: string
  ): Promise<{ modules: ModuleRecord[]; connections: ConnectionRecord[] }> {
    const modules = Array.from(this.modules.values()).filter(
      (m) => m.repoPath === repoPath
    );
    const connections = Array.from(this.connections.values()).filter(
      (c) => c.repoPath === repoPath
    );
    return { modules, connections };
  }

  // Connection operations
  async insertConnections(connections: ConnectionRecord[]): Promise<void> {
    for (const conn of connections) {
      this.connections.set(conn.id, conn);
    }
    await this.saveData();
  }

  // File metadata operations
  async updateFileMetadata(
    file: string,
    hash: string,
    repoPath: string,
    symbolCount: number,
    moduleCount: number
  ): Promise<void> {
    this.fileMetadata.set(file, { hash, lastModified: Date.now() });
    await this.saveData();
  }

  async getFileMetadata(
    file: string
  ): Promise<{ hash: string; lastModified: number } | null> {
    return this.fileMetadata.get(file) || null;
  }

  // Cleanup operations
  async cleanupRepo(repoPath: string): Promise<void> {
    // Remove all data for this repo
    for (const [id, symbol] of this.symbols.entries()) {
      if (symbol.repoPath === repoPath) {
        this.symbols.delete(id);
      }
    }

    for (const [id, module] of this.modules.entries()) {
      if (module.repoPath === repoPath) {
        this.modules.delete(id);
      }
    }

    for (const [id, conn] of this.connections.entries()) {
      if (conn.repoPath === repoPath) {
        this.connections.delete(id);
      }
    }

    await this.saveData();
  }

  // Statistics
  async getStats(repoPath: string): Promise<{
    symbolCount: number;
    moduleCount: number;
    fileCount: number;
    connectionCount: number;
  }> {
    let symbolCount = 0;
    let moduleCount = 0;
    let connectionCount = 0;
    let fileCount = 0;

    for (const symbol of this.symbols.values()) {
      if (symbol.repoPath === repoPath) {
        symbolCount++;
      }
    }

    for (const module of this.modules.values()) {
      if (module.repoPath === repoPath) {
        moduleCount++;
      }
    }

    for (const conn of this.connections.values()) {
      if (conn.repoPath === repoPath) {
        connectionCount++;
      }
    }

    const files = new Set<string>();
    for (const [file, metadata] of this.fileMetadata.entries()) {
      if (file.startsWith(repoPath)) {
        files.add(file);
      }
    }
    fileCount = files.size;

    return { symbolCount, moduleCount, fileCount, connectionCount };
  }

  async close(): Promise<void> {
    await this.saveData();
  }
}
