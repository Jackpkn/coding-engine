#!/usr/bin/env node

const http = require("http");
const { GroqLLMService } = require("./out/llmService");

async function testFinalContext() {
  console.log("🎯 Testing Final Improved Context Extraction\n");

  async function makeRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, "http://localhost:3000");
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

  // Simulate what the improved chat extension does
  async function buildImprovedContext(query) {
    console.log(`🔍 Building context for: "${query}"`);

    const context = {
      query,
      searchResults: [],
      codeSnippets: [],
      modules: [],
      signals: [],
    };

    // Get modules
    const moduleSearch = await makeRequest(
      "GET",
      "/search?query=module&type=symbol"
    );
    if (moduleSearch.data.success && moduleSearch.data.data) {
      const allModules = moduleSearch.data.data.results.filter(
        (r) => r.symbol?.kind === "module"
      );
      allModules.forEach((r) => {
        if (r.symbol) {
          context.modules.push(r.symbol.name);
        }
      });
    }

    // Get specific instantiation patterns
    const instancePatterns = [
      "cpu_core u_cpu",
      "cache_controller u_cache",
      "memory_controller u_memory",
    ];

    for (const pattern of instancePatterns) {
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(pattern)}`
      );
      if (result.data.success && result.data.data) {
        result.data.data.results.forEach((r) => {
          if (
            r.snippet &&
            r.snippet.length > 10 &&
            !r.snippet.includes("instance module")
          ) {
            context.codeSnippets.push(
              `${r.file.split("/").pop()}:${r.line + 1} - ${r.snippet}`
            );
          }
        });
      }
    }

    // Get connection patterns
    const connectionTerms = [
      ".clk(clk)",
      ".rst_n(rst_n)",
      ".mem_addr(mem_addr)",
      ".cpu_data_out(cpu_data_out)",
    ];
    for (const term of connectionTerms) {
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(term)}`
      );
      if (result.data.success && result.data.data) {
        result.data.data.results.slice(0, 2).forEach((r) => {
          if (
            r.snippet &&
            r.snippet.includes(".") &&
            !r.snippet.includes("port ") &&
            !r.snippet.includes("register ")
          ) {
            context.codeSnippets.push(
              `${r.file.split("/").pop()}:${r.line + 1} - ${r.snippet}`
            );
          }
        });
      }
    }

    // Remove duplicates
    context.modules = [...new Set(context.modules)];
    context.codeSnippets = [...new Set(context.codeSnippets)];

    return context;
  }

  try {
    // Test the improved context building
    const context = await buildImprovedContext(
      "How are the modules connected?"
    );

    console.log("\n📊 Improved Context Summary:");
    console.log(
      `   Modules: ${context.modules.length} - ${context.modules.join(", ")}`
    );
    console.log(`   Code Snippets: ${context.codeSnippets.length}`);

    console.log("\n🔍 Quality Code Snippets for LLM:");
    context.codeSnippets.forEach((snippet, i) => {
      console.log(`   ${i + 1}. ${snippet}`);
    });

    // Test with LLM if available
    const groqService = new GroqLLMService();
    if (groqService.isConfigured()) {
      console.log("\n🤖 Testing with Groq LLM...");

      const llmResponse = await groqService.generateResponse(context);
      if (llmResponse.success) {
        console.log("\n📝 LLM Response:");
        console.log("─".repeat(60));
        console.log(llmResponse.content);
        console.log("─".repeat(60));
      } else {
        console.log(`❌ LLM failed: ${llmResponse.error}`);
      }
    } else {
      console.log("\n⚠️  Groq not configured - skipping LLM test");
    }

    console.log("\n🎉 Final Context Test Complete!");
    console.log(
      "\n🚀 The improved extension should now provide much better responses!"
    );
    console.log('   Try asking: "How are the modules connected?" in VS Code');
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testFinalContext();
