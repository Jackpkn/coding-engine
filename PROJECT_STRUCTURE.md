# 🏗️ Verilog Chat Assistant - Project Structure

## 📁 **Core Files**

### **Extension Entry Point**

- `src/chatExtension.ts` - Main VS Code extension with LLM-powered chat interface

### **Core Services**

- `src/index.ts` - HTTP API server entry point
- `src/llmService.ts` - Groq LLM integration and fallback service
- `src/apiClient.ts` - HTTP client for VS Code extension
- `src/verilogParser.ts` - Tree-sitter Verilog parser wrapper

### **Core Engine**

- `src/server/http.ts` - HTTP API server with REST endpoints
- `src/core/parserManager.ts` - Tree-sitter integration and AST management
- `src/core/symbolIndexer.ts` - Symbol extraction and indexing (ctags + custom)
- `src/core/search.ts` - Hybrid search engine (symbol + ripgrep)

### **Configuration**

- `package.json` - Extension manifest and dependencies
- `tsconfig.json` - TypeScript configuration
- `.vscode/` - VS Code debugging and task configuration

### **Assets**

- `wasm/tree-sitter-systemverilog.wasm` - SystemVerilog grammar for Tree-sitter

## 📁 **Test & Demo Files**

### **Comprehensive Tests**

- `test-full-llm.js` - Complete LLM integration test with real codebase
- `test-llm-integration.js` - LLM service unit tests
- `check-server.js` - Server health check and startup script

### **Demo Files**

- `test_module.sv` - Simple Verilog modules (ALU, CPU core)
- `test_complex.sv` - Complex system with cache and memory controllers
- `cli-client.js` - Command-line interface demo
- `web-demo.html` - Browser-based demo interface

### **Utilities**

- `scripts/dev.sh` - Development startup script

## 📁 **Documentation**

- `README.md` - Main project documentation
- `CHAT_EXTENSION_GUIDE.md` - Chat extension user guide
- `EXTENSION_TEST_GUIDE.md` - Extension testing instructions
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- `PROJECT_STRUCTURE.md` - This file

## 🚀 **Key Features Implemented**

### **1. Editor-Agnostic Core API**

- HTTP REST API for any editor/tool integration
- WebSocket support for real-time updates
- JSON responses for universal compatibility

### **2. Advanced Verilog Analysis**

- Tree-sitter incremental parsing
- Symbol indexing with ctags integration
- Fast search with ripgrep fallback
- Module, signal, and port extraction

### **3. LLM-Powered Chat Interface**

- Groq integration for intelligent responses
- Context-aware code analysis
- Natural language query processing
- Fallback service for offline use

### **4. VS Code Integration**

- Chat panel with webview interface
- Hover providers for quick info
- Symbol search with fuzzy matching
- Real-time file watching and updates

## 🎯 **Usage**

### **Start the API Server**

```bash
npm run server
# or
node out/index.js
```

### **Install VS Code Extension**

```bash
vsce package
code --install-extension verilog-*.vsix
```

### **Use Chat Interface**

- Press `Ctrl+Shift+V` to open chat
- Ask questions like:
  - "What does cpu_core do?"
  - "Show me all modules"
  - "Find the ALU"

### **Test Everything**

```bash
node test-full-llm.js
```

## 🔧 **Configuration**

### **Groq LLM (Optional)**

Set in VS Code Settings:

- `verilog.groqApiKey` - Your Groq API key
- `verilog.enableLLM` - Enable/disable LLM features

### **Environment Variables**

- `GROQ_API_KEY` - Groq API key
- `CORE_PORT` - API server port (default: 3000)

## 📊 **Architecture**

```
┌─────────────────┐
│ VS Code Chat    │ ← User Interface
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ HTTP API Server │ ← Editor-Agnostic Layer
└─────────────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
┌─────┐ ┌─────┐ ┌─────┐
│Parse│ │Index│ │ LLM │ ← Core Services
└─────┘ └─────┘ └─────┘
```

**Your Verilog Chat Assistant is production-ready!** 🚀
