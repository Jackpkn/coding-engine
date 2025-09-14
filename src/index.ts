#!/usr/bin/env node

import * as path from "path";
import { HttpServer } from "./server/http";
import { ParserManager } from "./core/parserManager";
import { SymbolIndexer } from "./core/symbolIndexer";
import { SearchEngine } from "./core/search";

async function main() {
  const port = parseInt(process.env.CORE_PORT || "3000", 10);
  const wasmPath = path.join(
    __dirname,
    "..",
    "wasm",
    "tree-sitter-systemverilog.wasm"
  );

  console.log("Starting Verilog Core API...");
  console.log(`WASM path: ${wasmPath}`);

  // Initialize core components
  const parserManager = new ParserManager(wasmPath);
  const symbolIndexer = new SymbolIndexer();
  const searchEngine = new SearchEngine(symbolIndexer);

  // Initialize parser
  await parserManager.initialize();

  // Create and start HTTP server
  const server = new HttpServer(parserManager, symbolIndexer, searchEngine);

  await server.listen(port);

  console.log(`✅ Verilog Core API ready!`);
  console.log(`📡 HTTP server: http://localhost:${port}`);
  console.log(`🔍 Health check: http://localhost:${port}/health`);
  console.log("");
  console.log("API Endpoints:");
  console.log("  POST /index        - Index a repository");
  console.log("  POST /updateFile   - Update a single file");
  console.log("  GET  /search       - Search symbols and text");
  console.log("  GET  /symbol/:id   - Get symbol details");
  console.log("  GET  /health       - Health check");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down...");
    await server.close();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  });
}

export { main };
