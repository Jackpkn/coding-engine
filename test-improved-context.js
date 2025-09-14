#!/usr/bin/env node

const http = require("http");

async function testImprovedContext() {
  console.log("🧪 Testing Improved Context Extraction\n");

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
    // Test searches that should find your actual code
    const testSearches = [
      "cpu_system",
      "cache_controller",
      "memory_controller",
      "u_cpu",
      "u_cache",
      "u_memory",
      "mem_addr",
      "cpu_data_out",
    ];

    console.log("1. 🔍 Testing Individual Searches");
    for (const term of testSearches) {
      const result = await makeRequest("GET", `/search?query=${term}`);
      if (result.data.success) {
        const count = result.data.data.results.length;
        console.log(`   ${term}: ${count} results`);

        if (count > 0) {
          const first = result.data.data.results[0];
          console.log(
            `      → ${first.symbol?.name || "match"} (${
              first.symbol?.kind || first.type
            }) - ${first.file.split("/").pop()}:${first.line + 1}`
          );
          console.log(`      → Code: ${first.snippet}`);
        }
      }
    }

    console.log("\n2. 🏗️ Testing Module Discovery");
    const moduleResult = await makeRequest(
      "GET",
      "/search?query=module&type=symbol"
    );
    if (moduleResult.data.success) {
      const modules = moduleResult.data.data.results.filter(
        (r) => r.symbol?.kind === "module"
      );
      console.log(`   Found ${modules.length} modules:`);
      modules.forEach((m) => {
        console.log(
          `      • ${m.symbol.name} - ${m.file.split("/").pop()}:${m.line + 1}`
        );
      });
    }

    console.log("\n3. 🔗 Testing Instance Discovery");
    const instanceResult = await makeRequest("GET", "/search?query=instance");
    if (instanceResult.data.success) {
      const instances = instanceResult.data.data.results;
      console.log(`   Found ${instances.length} instance-related results:`);
      instances.slice(0, 5).forEach((r) => {
        console.log(`      • ${r.symbol?.name || "match"} - ${r.snippet}`);
      });
    }

    console.log("\n4. 🎯 Testing Connection Patterns");
    const connectionTerms = [
      ".clk",
      ".rst_n",
      "assign",
      "mem_addr",
      "cpu_data",
    ];
    for (const term of connectionTerms) {
      const result = await makeRequest(
        "GET",
        `/search?query=${encodeURIComponent(term)}`
      );
      if (result.data.success && result.data.data.results.length > 0) {
        console.log(`   ${term}: ${result.data.data.results.length} matches`);
        const sample = result.data.data.results[0];
        console.log(`      → ${sample.snippet}`);
      }
    }

    console.log("\n✅ Context extraction test completed!");
    console.log(
      '\n🚀 Now try asking: "How are the modules connected?" in VS Code'
    );
    console.log(
      "   The LLM should now have much better context about your actual code structure!"
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testImprovedContext();
