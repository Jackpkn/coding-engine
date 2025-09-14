#!/usr/bin/env node

const http = require("http");

async function debugContextExtraction() {
  console.log("🔍 Debugging Context Extraction for Connection Query\n");

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

  try {
    console.log("1. 📁 Re-indexing to ensure fresh data");
    const indexResult = await makeRequest("POST", "/index", {
      repoPath: process.cwd(),
    });
    if (indexResult.data.success) {
      console.log(
        `   ✅ Indexed ${indexResult.data.data.filesIndexed} files, ${indexResult.data.data.symbols} symbols`
      );
    }

    console.log("\n2. 🔍 Testing searches that should find your actual code");

    // Test searches for your specific modules and connections
    const searches = [
      { term: "cpu_system", description: "Top-level module" },
      { term: "cache_controller", description: "Cache module" },
      { term: "memory_controller", description: "Memory module" },
      { term: "u_cpu", description: "CPU instance" },
      { term: "u_cache", description: "Cache instance" },
      { term: "u_memory", description: "Memory instance" },
      { term: ".clk(clk)", description: "Clock connections" },
      { term: ".rst_n(rst_n)", description: "Reset connections" },
      { term: "mem_addr", description: "Memory address signals" },
      { term: "cpu_data_out", description: "CPU data output" },
    ];

    for (const search of searches) {
      console.log(`\n   Testing: ${search.term} (${search.description})`);
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(search.term)}`
      );

      if (result.data.success) {
        const results = result.data.data.results;
        console.log(`   📊 Found ${results.length} results`);

        if (results.length > 0) {
          results.slice(0, 2).forEach((r, i) => {
            console.log(
              `      ${i + 1}. ${r.symbol?.name || "text match"} (${
                r.symbol?.kind || r.type
              })`
            );
            console.log(
              `         File: ${r.file.split("/").pop()}:${r.line + 1}`
            );
            console.log(`         Code: ${r.snippet}`);
          });
        }
      } else {
        console.log(`   ❌ Search failed: ${result.data.error}`);
      }
    }

    console.log(
      "\n3. 🏗️ Testing what context would be built for connection query"
    );

    // Simulate what the chat extension does for "How are the modules connected?"
    const connectionSearches = [
      "module",
      "instance",
      "u_cpu",
      "u_cache",
      "u_memory",
      "cpu_system",
      ".clk",
      ".rst_n",
      "assign",
      "mem_addr",
      "cpu_data",
    ];

    let totalSnippets = [];
    let foundModules = [];

    for (const term of connectionSearches) {
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(term)}`
      );
      if (result.data.success) {
        result.data.data.results.forEach((r) => {
          if (r.snippet && r.snippet.length > 10) {
            totalSnippets.push(
              `${r.file.split("/").pop()}:${r.line + 1} - ${r.snippet}`
            );
          }
          if (r.symbol?.kind === "module") {
            foundModules.push(r.symbol.name);
          }
        });
      }
    }

    // Remove duplicates
    totalSnippets = [...new Set(totalSnippets)];
    foundModules = [...new Set(foundModules)];

    console.log(`\n   📝 Context Summary:`);
    console.log(
      `      Modules found: ${foundModules.length} - ${foundModules.join(", ")}`
    );
    console.log(`      Code snippets: ${totalSnippets.length}`);

    console.log(`\n   🔍 Sample code snippets that would be sent to LLM:`);
    totalSnippets.slice(0, 10).forEach((snippet, i) => {
      console.log(`      ${i + 1}. ${snippet}`);
    });

    console.log("\n4. 🎯 Checking if your actual module connections are found");

    // Look for your specific connection patterns
    const yourConnections = [
      "cpu_core u_cpu",
      "cache_controller u_cache",
      "memory_controller u_memory",
      ".cpu_addr(cpu_data_addr)",
      ".mem_addr(mem_addr)",
      ".cpu_data_out(cpu_data_out)",
    ];

    for (const conn of yourConnections) {
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(conn)}`
      );
      if (result.data.success && result.data.data.results.length > 0) {
        console.log(`   ✅ Found: ${conn}`);
        console.log(`      → ${result.data.data.results[0].snippet}`);
      } else {
        console.log(`   ❌ Missing: ${conn}`);
      }
    }

    console.log("\n🎯 Analysis Complete!");
    console.log(
      "\nIf the LLM is still giving generic responses, the issue is likely:"
    );
    console.log("1. ❌ Not enough specific code snippets being found");
    console.log("2. ❌ Module instantiation patterns not being detected");
    console.log("3. ❌ Connection syntax (.port(signal)) not being indexed");

    console.log("\n💡 Recommendations:");
    console.log("1. Create a simpler test file with clear module connections");
    console.log(
      "2. Improve the symbol indexer to better detect instantiation patterns"
    );
    console.log(
      "3. Add specific search patterns for Verilog connection syntax"
    );
  } catch (error) {
    console.error("❌ Debug failed:", error.message);
  }
}

debugContextExtraction();
