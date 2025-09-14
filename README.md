# Verilog Core API

A lean, editor-agnostic Verilog/SystemVerilog code analysis engine with HTTP API for low-latency symbol search, parsing, and AI integration.

## 🚀 Features

- **Editor-agnostic**: HTTP API works with VS Code, Vim, Emacs, AI assistants, or any client
- **Low-latency**: Tree-sitter incremental parsing + in-memory symbol indexing
- **Verilog-focused**: Optimized for SystemVerilog/Verilog syntax and constructs
- **Fast search**: Hybrid symbol + ripgrep text search with fuzzy matching
- **Real-time updates**: File watching and incremental re-parsing

## 🏗️ Architecture

```
┌───────────────────┐
│   Core API Layer  │ ← HTTP/WebSocket (VS Code, Vim, Emacs, AI Chat)
└───────────────────┘
         │
         ▼
┌───────────────────┐
│ Parsing Layer     │
│  (Tree-sitter)    │
└───────────────────┘
         │
         ▼
┌───────────────────┐
│ Symbol Indexer    │
│ (ctags + custom)  │
└───────────────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
┌─────┐ ┌─────┐ ┌─────┐
│Search│ │Graph│ │ AI  │
│Engine│ │Build│ │Layer│
└─────┘ └─────┘ └─────┘
```

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Core API Server

```bash
npm run server
# Server starts on http://localhost:3000
```

### 3. Test the API

```bash
# Health check
curl http://localhost:3000/health

# Index a repository
curl -X POST http://localhost:3000/index \
  -H "Content-Type: application/json" \
  -d '{"repoPath": "."}'

# Search for symbols
curl "http://localhost:3000/search?query=alu"
```

### 4. Use the CLI Client

```bash
node cli-client.js
```

Commands:

- `health` - Check server status
- `index [path]` - Index repository
- `search <query>` - Search symbols/text
- `modules` - List all modules

## 📡 API Endpoints

| Method | Endpoint      | Description         |
| ------ | ------------- | ------------------- |
| `GET`  | `/health`     | Health check        |
| `POST` | `/index`      | Index repository    |
| `POST` | `/updateFile` | Update single file  |
| `GET`  | `/search`     | Search symbols/text |
| `GET`  | `/symbol/:id` | Get symbol details  |

### Example Responses

**Index Repository:**

```json
{
  "success": true,
  "data": {
    "filesIndexed": 1,
    "modules": [
      {
        "name": "alu",
        "filePath": "test_module.sv",
        "startLine": 0,
        "endLine": 22,
        "ports": [
          { "name": "a", "direction": "input", "type": "wire" },
          { "name": "result", "direction": "output", "type": "wire" }
        ]
      }
    ],
    "symbols": 18
  }
}
```

**Search Results:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "type": "symbol",
        "file": "/path/to/file.sv",
        "line": 0,
        "snippet": "module alu",
        "symbol": {
          "name": "alu",
          "kind": "module",
          "startLine": 0,
          "endLine": 22
        },
        "score": 100
      }
    ],
    "count": 1
  }
}
```

## 🔌 Editor Integration

### VS Code Extension

The project includes both embedded and API-based VS Code extensions:

```bash
# Compile extension
npm run compile

# Use embedded parser (original)
Command: "Verilog: Find Symbol (Embedded)"

# Use HTTP API (new)
Command: "Verilog: Find Symbol (API)"
Command: "Verilog: Index Workspace"
```

### Other Editors

Any editor can integrate by making HTTP requests to the API:

**Vim/Neovim:** Use `curl` or HTTP client plugins
**Emacs:** Use `request.el` or similar HTTP libraries
**AI Assistants:** Direct API calls for code analysis

## 🧪 Testing

```bash
# Run API tests
node test-api.js

# Interactive CLI testing
node cli-client.js

# Manual testing
curl -s http://localhost:3000/health | jq
```

## 📁 Project Structure

```
verilog-core/
├── src/
│   ├── index.ts              # Main server entry
│   ├── server/http.ts        # HTTP API server
│   ├── core/
│   │   ├── parserManager.ts  # Tree-sitter integration
│   │   ├── symbolIndexer.ts  # Symbol extraction & indexing
│   │   └── search.ts         # Search engine (ripgrep + fuzzy)
│   ├── apiClient.ts          # API client library
│   ├── extension.ts          # VS Code extension (embedded)
│   ├── extensionApi.ts       # VS Code extension (API-based)
│   └── verilogParser.ts      # Tree-sitter parser wrapper
├── wasm/
│   └── tree-sitter-systemverilog.wasm
├── cli-client.js             # Interactive CLI client
├── test-api.js               # API test suite
└── scripts/dev.sh            # Development script
```

## 🎯 What's Working

✅ **Core API Server** - HTTP endpoints for indexing and search  
✅ **Tree-sitter Parser** - SystemVerilog/Verilog AST parsing  
✅ **Symbol Indexer** - ctags + custom symbol extraction  
✅ **Search Engine** - Hybrid symbol + text search with scoring  
✅ **VS Code Integration** - Both embedded and API-based extensions  
✅ **CLI Client** - Editor-agnostic command-line interface  
✅ **Real-time Updates** - File watching and incremental parsing

## 🚧 Next Steps

- **AI Layer**: LLM integration for code summarization and Q&A
- **Graph Builder**: Module instantiation and signal flow graphs
- **WebSocket Support**: Real-time streaming for large operations
- **Performance**: Optimize for large codebases (>1000 files)
- **LSP Bridge**: Optional Language Server Protocol integration

## 🔧 Configuration

Environment variables:

- `CORE_PORT` - API server port (default: 3000)
- `FASTMCP_LOG_LEVEL` - Logging level
- `LLM_BACKEND` - AI backend configuration

## 📝 License

MIT License - see LICENSE file for details.
