import { execSync } from "child_process";
import * as path from "path";
import { SymbolIndexer, Symbol } from "./symbolIndexer";

export interface SearchResult {
  type: "symbol" | "text";
  file: string;
  line: number;
  column?: number;
  snippet: string;
  symbol?: Symbol;
  score?: number;
}

export class SearchEngine {
  private symbolIndexer: SymbolIndexer;
  private repoPath: string = "";

  constructor(symbolIndexer: SymbolIndexer) {
    this.symbolIndexer = symbolIndexer;
  }

  setRepoPath(repoPath: string): void {
    this.repoPath = repoPath;
  }

  async search(query: string, type?: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // First try symbol search
    if (!type || type === "symbol") {
      const symbolResults = await this.searchSymbols(query);
      results.push(...symbolResults);
    }

    // If no symbol results or text search requested, use ripgrep
    if (results.length === 0 || type === "text") {
      const textResults = await this.searchText(query);
      results.push(...textResults);
    }

    // Sort by relevance
    return this.sortResults(results, query);
  }

  private async searchSymbols(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const symbols = this.symbolIndexer.listSymbols();

    for (const symbol of symbols) {
      const score = this.calculateSymbolScore(symbol, query);
      if (score > 0) {
        results.push({
          type: "symbol",
          file: symbol.path,
          line: symbol.startLine,
          snippet: `${symbol.kind} ${symbol.name}`,
          symbol,
          score,
        });
      }
    }

    return results;
  }

  private async searchText(query: string): Promise<SearchResult[]> {
    if (!this.repoPath) {
      console.warn("No repo path set for text search");
      return [];
    }

    try {
      // Check if ripgrep is available
      execSync("which rg", { stdio: "ignore" });
      return await this.ripgrepSearch(query);
    } catch (error) {
      console.warn("ripgrep not available, falling back to grep");
      return await this.grepSearch(query);
    }
  }

  private async ripgrepSearch(query: string): Promise<SearchResult[]> {
    try {
      const output = execSync(
        `rg --json --line-number --column --context 1 ` +
          `--type-add 'verilog:*.{v,sv,svh,vh}' --type verilog ` +
          `"${this.escapeRegex(query)}" "${this.repoPath}"`,
        { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );

      return this.parseRipgrepOutput(output);
    } catch (error) {
      // ripgrep returns non-zero exit code when no matches found
      if (error instanceof Error && "status" in error && error.status === 1) {
        return [];
      }
      throw error;
    }
  }

  private parseRipgrepOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const json = JSON.parse(line);
        if (json.type === "match") {
          const data = json.data;
          results.push({
            type: "text",
            file: data.path.text,
            line: data.line_number - 1, // Convert to 0-based
            column: data.submatches[0]?.start || 0,
            snippet: data.lines.text.trim(),
          });
        }
      } catch (parseError) {
        // Skip malformed JSON lines
        continue;
      }
    }

    return results;
  }

  private async grepSearch(query: string): Promise<SearchResult[]> {
    try {
      const output = execSync(
        `grep -rn --include="*.v" --include="*.sv" --include="*.svh" --include="*.vh" ` +
          `"${this.escapeRegex(query)}" "${this.repoPath}"`,
        { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 }
      );

      return this.parseGrepOutput(output);
    } catch (error) {
      // grep returns non-zero exit code when no matches found
      if (error instanceof Error && "status" in error && error.status === 1) {
        return [];
      }
      throw error;
    }
  }

  private parseGrepOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, filePath, lineNum, snippet] = match;
        results.push({
          type: "text",
          file: path.resolve(filePath),
          line: parseInt(lineNum, 10) - 1, // Convert to 0-based
          snippet: snippet.trim(),
        });
      }
    }

    return results;
  }

  private calculateSymbolScore(symbol: Symbol, query: string): number {
    const name = symbol.name.toLowerCase();
    const q = query.toLowerCase();

    // Exact match
    if (name === q) {
      return 100;
    }

    // Starts with query
    if (name.startsWith(q)) {
      return 90;
    }

    // Contains query
    if (name.includes(q)) {
      return 70;
    }

    // Fuzzy match (simple)
    const distance = this.levenshteinDistance(name, q);
    const threshold = Math.max(1, Math.floor(name.length * 0.3));

    if (distance <= threshold) {
      return Math.max(1, 60 - distance * 5);
    }

    return 0;
  }

  private sortResults(results: SearchResult[], query: string): SearchResult[] {
    return results.sort((a, b) => {
      // Prioritize symbol results
      if (a.type === "symbol" && b.type === "text") {
        return -1;
      }
      if (a.type === "text" && b.type === "symbol") {
        return 1;
      }

      // Sort by score if available
      if (a.score !== undefined && b.score !== undefined) {
        return b.score - a.score;
      }

      // Sort by file name, then line number
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) {
        return fileCompare;
      }

      return a.line - b.line;
    });
  }

  private levenshteinDistance(a: string, b: string): number {
    if (!a) {
      return b.length;
    }
    if (!b) {
      return a.length;
    }

    const dp: number[] = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) {
      dp[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cur = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = cur;
      }
    }

    return dp[b.length];
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
