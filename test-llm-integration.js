#!/usr/bin/env node

const { GroqLLMService, FallbackLLMService } = require("./out/llmService");

async function testLLMIntegration() {
  console.log("🤖 Testing LLM Integration\n");

  // Test 1: Check if Groq is configured
  console.log("1. 🔧 Checking LLM Configuration");
  const groqService = new GroqLLMService();
  const fallbackService = new FallbackLLMService();

  console.log(
    `   Groq API Key: ${
      groqService.isConfigured() ? "✅ Configured" : "❌ Not configured"
    }`
  );
  console.log(
    `   Fallback Service: ${
      fallbackService.isConfigured() ? "✅ Available" : "❌ Not available"
    }`
  );

  const activeService = groqService.isConfigured()
    ? groqService
    : fallbackService;
  console.log(
    `   Active Service: ${groqService.isConfigured() ? "Groq" : "Fallback"}\n`
  );

  // Test 2: General Verilog question
  console.log("2. 🧠 Testing General Verilog Question");
  const generalContext = {
    query: "What is Verilog?",
    searchResults: [],
    codeSnippets: [],
    modules: [],
    signals: [],
  };

  try {
    const generalResponse = await activeService.generateResponse(
      generalContext
    );
    console.log(`   Success: ${generalResponse.success}`);
    if (generalResponse.success) {
      console.log(
        `   Response Preview: ${generalResponse.content.substring(0, 100)}...`
      );
    } else {
      console.log(`   Error: ${generalResponse.error}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test 3: Code-specific question with context
  console.log("\n3. 💻 Testing Code-Specific Question with Context");
  const codeContext = {
    query: "Explain the ALU module",
    searchResults: [
      {
        symbol: { name: "alu", kind: "module" },
        file: "test_module.sv",
        line: 0,
        snippet: "module alu (",
        type: "symbol",
      },
      {
        symbol: { name: "alu_result", kind: "signal" },
        file: "test_module.sv",
        line: 34,
        snippet: "logic [31:0] alu_result;",
        type: "symbol",
      },
    ],
    codeSnippets: [
      "test_module.sv:1 - module alu (",
      "test_module.sv:35 - logic [31:0] alu_result;",
    ],
    modules: ["alu", "cpu_core"],
    signals: ["alu_result", "alu_zero"],
  };

  try {
    const codeResponse = await activeService.generateResponse(codeContext);
    console.log(`   Success: ${codeResponse.success}`);
    if (codeResponse.success) {
      console.log(
        `   Response Preview: ${codeResponse.content.substring(0, 150)}...`
      );
    } else {
      console.log(`   Error: ${codeResponse.error}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test 4: Test different query types
  console.log("\n4. 🔍 Testing Different Query Types");
  const testQueries = [
    { query: "How to write a Verilog module?", expected: "general" },
    { query: "Show me all modules", expected: "code-specific" },
    { query: "What does cpu_core do?", expected: "code-specific" },
    { query: "Verilog syntax basics", expected: "general" },
  ];

  for (const test of testQueries) {
    const isCodeSpecific = isCodeSpecificQuery(test.query);
    const result = isCodeSpecific ? "code-specific" : "general";
    const status = result === test.expected ? "✅" : "❌";
    console.log(
      `   ${status} "${test.query}" → ${result} (expected: ${test.expected})`
    );
  }

  console.log("\n🎉 LLM Integration Test Complete!");

  if (groqService.isConfigured()) {
    console.log("\n🚀 Groq Integration Status: READY");
    console.log(
      "   Your chat extension will use Groq for intelligent responses"
    );
  } else {
    console.log("\n⚠️  Groq Integration Status: NOT CONFIGURED");
    console.log("   To enable Groq:");
    console.log("   1. Get API key from https://console.groq.com/");
    console.log(
      '   2. Set environment variable: export GROQ_API_KEY="your-key"'
    );
    console.log(
      "   3. Or configure in VS Code: Settings → Verilog: Groq Api Key"
    );
    console.log("   4. Extension will use fallback service until configured");
  }
}

// Helper function (copied from chatExtension for testing)
function isCodeSpecificQuery(query) {
  const lowerQuery = query.toLowerCase();

  // General Verilog questions
  const generalPatterns = [
    /what is verilog/i,
    /how to.*verilog/i,
    /verilog.*syntax/i,
    /difference between.*verilog/i,
    /verilog.*tutorial/i,
    /learn.*verilog/i,
    /verilog.*basics/i,
    /systemverilog.*features/i,
  ];

  if (generalPatterns.some((pattern) => pattern.test(query))) {
    return false;
  }

  // Code-specific patterns
  const codeSpecificPatterns = [
    /show.*modules?/i,
    /find.*alu/i,
    /find.*cpu/i,
    /find.*memory/i,
    /list.*signals?/i,
    /what does.*do/i,
    /how does.*work/i,
    /explain.*module/i,
    /\b(alu|cpu|memory|cache|controller)\b/i,
  ];

  return (
    codeSpecificPatterns.some((pattern) => pattern.test(query)) ||
    query.includes("_") || // Likely a signal/module name
    /\b[a-z]+_[a-z]+\b/i.test(query)
  ); // snake_case identifiers
}

if (require.main === module) {
  testLLMIntegration().catch(console.error);
}
