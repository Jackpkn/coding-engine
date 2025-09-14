import * as http from "http";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface SearchResult {
  type: "symbol" | "text";
  file: string;
  line: number;
  column?: number;
  snippet: string;
  symbol?: {
    id: string;
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
  };
  score?: number;
}

export class VerilogApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  async indexRepo(repoPath: string): Promise<ApiResponse> {
    return this.makeRequest("POST", "/index", { repoPath });
  }

  async updateFile(filePath: string, content?: string): Promise<ApiResponse> {
    return this.makeRequest("POST", "/updateFile", { filePath, content });
  }

  async search(
    query: string,
    type?: string
  ): Promise<ApiResponse<{ results: SearchResult[]; count: number }>> {
    const params = new URLSearchParams({ query });
    if (type) {
      params.set("type", type);
    }
    return this.makeRequest("GET", `/search?${params.toString()}`);
  }

  async getSymbol(symbolId: string): Promise<ApiResponse> {
    return this.makeRequest("GET", `/symbol/${encodeURIComponent(symbolId)}`);
  }

  async healthCheck(): Promise<ApiResponse> {
    return this.makeRequest("GET", "/health");
  }

  // New file fetching methods
  async getFile(filePath: string): Promise<
    ApiResponse<{
      path: string;
      content: string;
      size: number;
      modified: Date;
      created: Date;
    }>
  > {
    return this.makeRequest("GET", `/file/${encodeURIComponent(filePath)}`);
  }

  async listFiles(dirPath: string): Promise<
    ApiResponse<{
      path: string;
      files: Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        isFile: boolean;
        size: number;
        modified: Date;
        created: Date;
      }>;
    }>
  > {
    return this.makeRequest("GET", `/files/${encodeURIComponent(dirPath)}`);
  }

  // Smart fetch - intelligently find and fetch relevant files based on query
  async smartFetch(
    query: string,
    maxFiles: number = 5,
    includeContent: boolean = false
  ): Promise<
    ApiResponse<{
      query: string;
      totalFilesFound: number;
      filesReturned: number;
      files: Array<{
        path: string;
        name: string;
        score: number;
        relevance: string;
        matches: number;
        size: number;
        modified: Date;
        created: Date;
        language: string;
        content?: string;
      }>;
      searchResults: any[];
    }>
  > {
    const params = new URLSearchParams({
      query,
      maxFiles: maxFiles.toString(),
      includeContent: includeContent.toString(),
    });
    return this.makeRequest("GET", `/fetch?${params.toString()}`);
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<ApiResponse> {
    return new Promise((resolve) => {
      const url = new URL(endpoint, this.baseUrl);
      const options: http.RequestOptions = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout
      };

      const req = http.request(url, options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            resolve({
              success: false,
              error: `Failed to parse response: ${body}`,
              timestamp: Date.now(),
            });
          }
        });
      });

      req.on("error", (error) => {
        resolve({
          success: false,
          error: `Connection failed: ${error.message}. Make sure the Verilog API server is running on ${this.baseUrl}`,
          timestamp: Date.now(),
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          success: false,
          error: `Request timeout. Make sure the Verilog API server is running on ${this.baseUrl}`,
          timestamp: Date.now(),
        });
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }
}
