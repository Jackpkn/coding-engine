#!/usr/bin/env node

const http = require("http");
const readline = require("readline");
const path = require("path");

const API_BASE = "http://localhost:3000";

class VerilogCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "verilog> ",
    });
  }

  async makeRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, API_BASE);
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
      };

      const req = http.request(url, options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on("error", reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  async handleCommand(input) {
    const [cmd, ...args] = input.trim().split(" ");

    try {
      switch (cmd) {
        case "help":
          this.showHelp();
          break;

        case "index":
          const repoPath = args[0] || ".";
          console.log(`🔄 Indexing ${repoPath}...`);
          const indexResult = await this.makeRequest("POST", "/index", {
            repoPath,
          });
          if (indexResult.data.success) {
            const { filesIndexed, modules, symbols } = indexResult.data.data;
            console.log(
              `✅ Indexed ${filesIndexed} files, ${modules.length} modules, ${symbols} symbols`
            );

            if (modules.length > 0) {
              console.log("\n📦 Modules found:");
              modules.forEach((m) => {
                console.log(
                  `  • ${m.name} (${m.ports.length} ports) - ${path.basename(
                    m.filePath
                  )}:${m.startLine + 1}`
                );
              });
            }
          } else {
            console.log(`❌ ${indexResult.data.error}`);
          }
          break;

        case "search":
          const query = args.join(" ");
          if (!query) {
            console.log("Usage: search <query>");
            break;
          }

          console.log(`🔍 Searching for "${query}"...`);
          const searchResult = await this.makeRequest(
            "GET",
            `/search?query=${encodeURIComponent(query)}`
          );
          if (searchResult.data.success) {
            const { results, count } = searchResult.data.data;
            console.log(`Found ${count} results:\n`);

            results.slice(0, 10).forEach((r, i) => {
              const location = `${path.basename(r.file)}:${r.line + 1}`;
              const name = r.symbol?.name || "text match";
              const kind = r.symbol?.kind || r.type;
              console.log(`${i + 1}. ${name} (${kind}) - ${location}`);
              console.log(`   ${r.snippet}`);
            });

            if (results.length > 10) {
              console.log(`   ... and ${results.length - 10} more results`);
            }
          } else {
            console.log(`❌ ${searchResult.data.error}`);
          }
          break;

        case "modules":
          console.log("🔍 Searching for modules...");
          const moduleResult = await this.makeRequest(
            "GET",
            "/search?query=module&type=symbol"
          );
          if (moduleResult.data.success) {
            const modules = moduleResult.data.data.results.filter(
              (r) => r.symbol?.kind === "module"
            );
            console.log(`Found ${modules.length} modules:\n`);

            modules.forEach((m, i) => {
              console.log(
                `${i + 1}. ${m.symbol.name} - ${path.basename(m.file)}:${
                  m.line + 1
                }`
              );
            });
          }
          break;

        case "file":
          const filePath = args[0];
          if (!filePath) {
            console.log("Usage: file <file_path>");
            break;
          }
          console.log(`📄 Fetching file: ${filePath}...`);
          const fileResult = await this.makeRequest("GET", `/file/${encodeURIComponent(filePath)}`);
          if (fileResult.data.success) {
            const { path: fullPath, content, size, modified } = fileResult.data.data;
            console.log(`\n📄 File: ${fullPath}`);
            console.log(`📊 Size: ${size} bytes`);
            console.log(`📅 Modified: ${new Date(modified).toLocaleString()}`);
            console.log("\n📝 Content:");
            console.log("─".repeat(60));
            console.log(content);
            console.log("─".repeat(60));
          } else {
            console.log(`❌ ${fileResult.data.error}`);
          }
          break;

        case "files":
          const dirPath = args[0] || ".";
          console.log(`📁 Listing files in: ${dirPath}...`);
          const filesResult = await this.makeRequest("GET", `/files/${encodeURIComponent(dirPath)}`);
          if (filesResult.data.success) {
            const { path: fullPath, files } = filesResult.data.data;
            console.log(`\n📁 Directory: ${fullPath}`);
            console.log(`📊 ${files.length} items found:\n`);
            
            files.forEach((f, i) => {
              const icon = f.isDirectory ? "📁" : "📄";
              const size = f.isFile ? ` (${f.size} bytes)` : "";
              const modified = new Date(f.modified).toLocaleDateString();
              console.log(`${i + 1}. ${icon} ${f.name}${size} - ${modified}`);
            });
          } else {
            console.log(`❌ ${filesResult.data.error}`);
          }
          break;

        case "fetch":
          const fetchQuery = args.join(" ");
          const maxFiles = parseInt(args.find(arg => arg.startsWith("--max="))?.split("=")[1]) || 5;
          const includeContent = args.includes("--content");
          
          if (!fetchQuery) {
            console.log("Usage: fetch <query> [--max=N] [--content]");
            console.log("  --max=N     Maximum files to return (default: 5)");
            console.log("  --content   Include file content in response");
            break;
          }
          
          console.log(`🔍 Smart fetching files for: "${fetchQuery}"...`);
          const fetchResult = await this.makeRequest("GET", 
            `/fetch?query=${encodeURIComponent(fetchQuery)}&maxFiles=${maxFiles}&includeContent=${includeContent}`);
          
          if (fetchResult.data.success) {
            const { query, totalFilesFound, filesReturned, files } = fetchResult.data.data;
            console.log(`\n🎯 Query: "${query}"`);
            console.log(`📊 Found ${totalFilesFound} relevant files, returning top ${filesReturned}:\n`);
            
            files.forEach((f, i) => {
              const relevanceIcon = f.relevance === 'high' ? '🔥' : f.relevance === 'medium' ? '⭐' : '📄';
              const languageIcon = f.language === 'python' ? '🐍' : f.language === 'javascript' ? '🟨' : f.language === 'systemverilog' ? '🔧' : '📄';
              const size = ` (${f.size} bytes)`;
              const matches = f.matches > 0 ? ` - ${f.matches} matches` : '';
              
              console.log(`${i + 1}. ${relevanceIcon} ${languageIcon} ${f.name}${size}${matches}`);
              console.log(`   📍 ${f.path}`);
              console.log(`   🎯 Score: ${f.score} | Relevance: ${f.relevance} | Language: ${f.language}`);
              
              if (includeContent && f.content) {
                console.log(`   📝 Content preview (first 200 chars):`);
                console.log(`   ${f.content.substring(0, 200)}${f.content.length > 200 ? '...' : ''}`);
              }
              console.log("");
            });
          } else {
            console.log(`❌ ${fetchResult.data.error}`);
          }
          break;

        case "health":
          const healthResult = await this.makeRequest("GET", "/health");
          if (healthResult.data.success) {
            console.log("✅ API server is healthy");
          } else {
            console.log("❌ API server is not responding");
          }
          break;

        case "quit":
        case "exit":
          console.log("👋 Goodbye!");
          process.exit(0);
          break;

        default:
          console.log(
            `Unknown command: ${cmd}. Type 'help' for available commands.`
          );
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  showHelp() {
    console.log(`
📚 Verilog CLI Commands:

  help                    - Show this help
  health                  - Check API server status
  index [path]            - Index repository (default: current directory)
  search <query>          - Search for symbols or text
  modules                 - List all modules
  file <path>             - Fetch and display file content
  files [path]            - List files in directory (default: current directory)
  fetch <query>           - Smart fetch: find and return most relevant files
  quit/exit               - Exit the CLI

Examples:
  search alu              - Find ALU-related symbols
  search "input logic"    - Search for input logic declarations
  index /path/to/repo     - Index a specific repository
  file test_module.sv     - Display content of test_module.sv
  files src/              - List files in src/ directory
  fetch alu               - Find and return top 5 files with ALU code
  fetch "memory controller" --max=3 --content  - Find top 3 memory files with content
`);
  }

  async start() {
    console.log("🚀 Verilog CLI - Editor-agnostic Verilog code navigation");
    console.log("Connected to API server at", API_BASE);

    // Check server health
    try {
      await this.makeRequest("GET", "/health");
      console.log("✅ API server is running\n");
    } catch (error) {
      console.log(
        "❌ Cannot connect to API server. Make sure it's running with: npm run server\n"
      );
    }

    console.log('Type "help" for available commands or "quit" to exit.');
    this.rl.prompt();

    this.rl.on("line", async (input) => {
      if (input.trim()) {
        await this.handleCommand(input);
      }
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log("\n👋 Goodbye!");
      process.exit(0);
    });
  }
}

if (require.main === module) {
  const cli = new VerilogCLI();
  cli.start().catch(console.error);
}
