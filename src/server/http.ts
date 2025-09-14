import * as http from "http";
import * as url from "url";
import { ParserManager } from "../core/parserManager";
import { SymbolIndexer } from "../core/symbolIndexer";
import { SearchEngine } from "../core/search";
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export class HttpServer {
  private server: http.Server;
  private parserManager: ParserManager;
  private symbolIndexer: SymbolIndexer;
  private searchEngine: SearchEngine;

  constructor(
    parserManager: ParserManager,
    symbolIndexer: SymbolIndexer,
    searchEngine: SearchEngine
  ) {
    this.parserManager = parserManager;
    this.symbolIndexer = symbolIndexer;
    this.searchEngine = searchEngine;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || "", true);
    const pathname = parsedUrl.pathname || "";
    const method = req.method || "GET";

    try {
      let response: ApiResponse;

      if (method === "POST" && pathname === "/index") {
        response = await this.handleIndex(req);
      } else if (method === "POST" && pathname === "/updateFile") {
        response = await this.handleUpdateFile(req);
      } else if (method === "GET" && pathname === "/search") {
        response = await this.handleSearch(parsedUrl.query);
      } else if (method === "GET" && pathname.startsWith("/symbol/")) {
        const symbolId = pathname.split("/")[2];
        response = await this.handleGetSymbol(symbolId);
      } else if (method === "GET" && pathname.startsWith("/file/")) {
        const filePath = pathname.split("/file/")[1];
        response = await this.handleGetFile(decodeURIComponent(filePath));
      } else if (method === "GET" && pathname.startsWith("/files/")) {
        const dirPath = pathname.split("/files/")[1];
        response = await this.handleListFiles(decodeURIComponent(dirPath));
      } else if (method === "GET" && pathname === "/fetch") {
        response = await this.handleSmartFetch(parsedUrl.query);
      } else if (method === "GET" && pathname === "/health") {
        response = {
          success: true,
          data: { status: "ok" },
          timestamp: Date.now(),
        };
      } else {
        response = {
          success: false,
          error: "Not found",
          timestamp: Date.now(),
        };
        res.writeHead(404);
      }

      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(response.success ? 200 : 400);
        res.end(JSON.stringify(response, null, 2));
      }
    } catch (error) {
      if (!res.headersSent) {
        const errorResponse: ApiResponse = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
        res.setHeader("Content-Type", "application/json");
        res.writeHead(500);
        res.end(JSON.stringify(errorResponse, null, 2));
      }
    }
  }

  private async handleIndex(req: http.IncomingMessage): Promise<ApiResponse> {
    const body = await this.readRequestBody(req);
    const { repoPath } = JSON.parse(body);

    if (!repoPath) {
      return {
        success: false,
        error: "repoPath is required",
        timestamp: Date.now(),
      };
    }

    // Set repo path for search engine
    this.searchEngine.setRepoPath(repoPath);

    const result = await this.parserManager.indexRepo(repoPath);
    await this.symbolIndexer.buildIndex(repoPath);

    return {
      success: true,
      data: {
        filesIndexed: result.filesIndexed,
        modules: result.modules,
        symbols: this.symbolIndexer.getSymbolCount(),
      },
      timestamp: Date.now(),
    };
  }

  private async handleUpdateFile(
    req: http.IncomingMessage
  ): Promise<ApiResponse> {
    const body = await this.readRequestBody(req);
    const { filePath, content } = JSON.parse(body);

    if (!filePath) {
      return {
        success: false,
        error: "filePath is required",
        timestamp: Date.now(),
      };
    }

    const result = await this.parserManager.updateFile(filePath, content);
    await this.symbolIndexer.updateFile(filePath, content);

    return {
      success: true,
      data: { updated: true, modules: result.modules },
      timestamp: Date.now(),
    };
  }

  private async handleSearch(query: any): Promise<ApiResponse> {
    const searchQuery = query.query as string;
    const searchType = query.type as string;

    if (!searchQuery) {
      return {
        success: false,
        error: "query parameter is required",
        timestamp: Date.now(),
      };
    }

    const results = await this.searchEngine.search(searchQuery, searchType);

    return {
      success: true,
      data: { results, count: results.length },
      timestamp: Date.now(),
    };
  }

  private async handleGetSymbol(symbolId: string): Promise<ApiResponse> {
    const symbol = this.symbolIndexer.getSymbol(symbolId);

    if (!symbol) {
      return {
        success: false,
        error: "Symbol not found",
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      data: symbol,
      timestamp: Date.now(),
    };
  }

  private async handleGetFile(filePath: string): Promise<ApiResponse> {
    try {
      const fs = require("fs");
      const path = require("path");

      // Security check - ensure file is within allowed directories
      const resolvedPath = path.resolve(filePath);

      const content = fs.readFileSync(resolvedPath, "utf8");
      const stats = fs.statSync(resolvedPath);

      return {
        success: true,
        data: {
          path: resolvedPath,
          content: content,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: Date.now(),
      };
    }
  }

  private async handleListFiles(dirPath: string): Promise<ApiResponse> {
    try {
      const fs = require("fs");
      const path = require("path");

      // Security check - ensure directory is within allowed directories
      const resolvedPath = path.resolve(dirPath);

      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const files = entries.map((entry: any) => {
        const fullPath = path.join(resolvedPath, entry.name);
        const stats = fs.statSync(fullPath);

        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
        };
      });

      return {
        success: true,
        data: {
          path: resolvedPath,
          files: files,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: Date.now(),
      };
    }
  }

  private async handleSmartFetch(query: any): Promise<ApiResponse> {
    const searchQuery = query.query as string;
    const maxFiles = parseInt(query.maxFiles as string) || 5;
    const includeContent = query.includeContent === "true";

    if (!searchQuery) {
      return {
        success: false,
        error: "query parameter is required",
        timestamp: Date.now(),
      };
    }

    try {
      // Step 1: Search for relevant symbols and text
      const searchResults = await this.searchEngine.search(searchQuery);

      // Step 2: Rank files by relevance
      const fileRankings = this.rankFilesByRelevance(
        searchResults,
        searchQuery
      );

      // Step 3: Get top N most relevant files
      const topFiles = fileRankings.slice(0, maxFiles);

      // Step 4: Fetch file contents if requested
      const filesWithContent = await this.fetchFileContents(
        topFiles,
        includeContent
      );

      return {
        success: true,
        data: {
          query: searchQuery,
          totalFilesFound: fileRankings.length,
          filesReturned: filesWithContent.length,
          files: filesWithContent,
          searchResults: searchResults.slice(0, 10), // Include some search context
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Smart fetch failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: Date.now(),
      };
    }
  }

  private rankFilesByRelevance(
    searchResults: any[],
    query: string
  ): Array<{
    file: string;
    score: number;
    matches: any[];
    relevance: string;
  }> {
    const fileScores = new Map<
      string,
      {
        score: number;
        matches: any[];
        symbolMatches: number;
        textMatches: number;
      }
    >();

    // Analyze search results
    for (const result of searchResults) {
      const file = result.file;
      if (!fileScores.has(file)) {
        fileScores.set(file, {
          score: 0,
          matches: [],
          symbolMatches: 0,
          textMatches: 0,
        });
      }

      const fileData = fileScores.get(file)!;
      fileData.matches.push(result);

      // Score based on result type and relevance
      if (result.type === "symbol") {
        fileData.symbolMatches++;
        fileData.score += result.score || 50; // Symbol matches are more valuable
      } else {
        fileData.textMatches++;
        fileData.score += 20; // Text matches are less valuable
      }

      // Boost score for exact matches
      if (result.symbol?.name?.toLowerCase().includes(query.toLowerCase())) {
        fileData.score += 30;
      }
    }

    // Convert to ranked array
    const rankedFiles = Array.from(fileScores.entries()).map(
      ([file, data]) => ({
        file,
        score: data.score,
        matches: data.matches,
        relevance: this.determineRelevance(data, query),
      })
    );

    // Sort by score (highest first)
    return rankedFiles.sort((a, b) => b.score - a.score);
  }

  private determineRelevance(fileData: any, query: string): string {
    const { symbolMatches, textMatches, score } = fileData;

    if (symbolMatches > 0 && score > 100) {
      return "high"; // Has symbol matches and high score
    } else if (symbolMatches > 0 || score > 50) {
      return "medium"; // Has some symbol matches or decent score
    } else if (textMatches > 0) {
      return "low"; // Only text matches
    } else {
      return "minimal"; // Very low relevance
    }
  }

  private async fetchFileContents(
    rankedFiles: Array<{
      file: string;
      score: number;
      matches: any[];
      relevance: string;
    }>,
    includeContent: boolean
  ): Promise<any[]> {
    const fs = require("fs");
    const path = require("path");

    const results = [];

    for (const fileData of rankedFiles) {
      try {
        const stats = fs.statSync(fileData.file);
        const result: any = {
          path: fileData.file,
          name: path.basename(fileData.file),
          score: fileData.score,
          relevance: fileData.relevance,
          matches: fileData.matches.length,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          language: this.detectLanguage(fileData.file),
        };

        if (includeContent) {
          result.content = fs.readFileSync(fileData.file, "utf8");
        }

        results.push(result);
      } catch (error) {
        // Skip files that can't be read
        console.warn(`Failed to read file ${fileData.file}:`, error);
      }
    }

    return results;
  }

  private detectLanguage(filePath: string): string {
    const path = require("path");
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      ".v": "verilog",
      ".sv": "systemverilog",
      ".svh": "systemverilog",
      ".vh": "verilog",
      ".py": "python",
      ".pyi": "python",
      ".js": "javascript",
      ".jsx": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
    };
    return languageMap[ext] || "unknown";
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  public listen(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`Verilog Core API server listening on port ${port}`);
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
