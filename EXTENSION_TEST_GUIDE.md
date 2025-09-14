# VS Code Extension Testing Guide

## 🚀 Quick Start

Your Verilog extension is ready! Here's how to test it:

### Method 1: Install the Packaged Extension

```bash
# Install the extension
code --install-extension verilog-0.0.1.vsix

# Open VS Code in this directory
code .
```

### Method 2: Development Mode (Recommended for testing)

1. Open VS Code in this directory: `code .`
2. Press `F5` to launch Extension Development Host
3. A new VS Code window will open with your extension loaded

## 🧪 Testing Scenarios

### 1. **Status Bar Check**

- Look at the bottom-right status bar
- Should show: `✅ Verilog API` (green checkmark)
- If red error icon: Start the API server with `npm run server`

### 2. **Index Workspace**

- Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
- Type: `Verilog: Index Workspace`
- Should show: "✅ Indexed X files, Y modules, Z symbols"

### 3. **Symbol Search**

- Press `Ctrl+Shift+P`
- Type: `Verilog: Find Symbol (API)`
- Try these searches:
  - `alu` → Should find ALU module and instance
  - `cpu_core` → Should find CPU core module
  - `memory_controller` → Should find memory controller
  - `cache` → Should find cache-related symbols
  - `logic` → Should find signal declarations

### 4. **Context Menu**

- Right-click in any `.sv` or `.v` file
- Select: `Verilog: Find Symbol (API)`
- Enter search term

### 5. **Hover Information**

- Open `test_module.sv` or `test_complex.sv`
- Hover over module names like `alu`, `cpu_core`
- Should show module information with ports

### 6. **Keyboard Shortcut**

- In a Verilog file, press `Ctrl+Shift+F` (Cmd+Shift+F on Mac)
- Should open symbol search dialog

## 📁 Test Files

- **`test_module.sv`** - Simple ALU and CPU core modules
- **`test_complex.sv`** - Complex system with cache and memory controllers

## 🔍 Expected Results

### Symbol Search for "alu":

```
✅ Found 4 results
1. alu (module) - test_module.sv:1
2. alu (instance) - test_module.sv:38
3. alu_result (signal) - test_module.sv:34
4. alu (module) - test_complex.sv:...
```

### Symbol Search for "cache":

```
✅ Found multiple results
1. cache_controller (module) - test_complex.sv:45
2. cache_data (signal) - test_complex.sv:67
3. cache_tags (signal) - test_complex.sv:68
4. cache_hit (signal) - test_complex.sv:76
```

### Hover over "alu":

````
Symbol: alu
module in test_module.sv (line 1)
```systemverilog
module alu (
    input  logic [31:0] a,
    input  logic [31:0] b,
    input  logic [3:0]  op,
    output logic [31:0] result,
    output logic        zero
);
````

## 🐛 Troubleshooting

### Status Bar Shows Error

- **Problem**: Red error icon in status bar
- **Solution**: Start API server: `npm run server`
- **Check**: `curl http://localhost:3000/health`

### No Search Results

- **Problem**: Search returns empty results
- **Solution**: Run "Verilog: Index Workspace" first
- **Check**: API server logs for indexing messages

### Extension Not Loading

- **Problem**: Commands not available in Command Palette
- **Solution**:
  1. Check VS Code Developer Console (`Help > Toggle Developer Tools`)
  2. Look for extension activation errors
  3. Recompile: `npm run compile`

### Hover Not Working

- **Problem**: No hover information shown
- **Solution**:
  1. Ensure file is recognized as SystemVerilog/Verilog
  2. Check file extension (`.sv`, `.v`, `.svh`, `.vh`)
  3. Try indexing workspace first

## 🎯 Success Criteria

✅ **Status bar shows connected API**  
✅ **Workspace indexing works and shows module count**  
✅ **Symbol search finds modules, signals, and instances**  
✅ **Hover shows module information with ports**  
✅ **Context menu and keyboard shortcuts work**  
✅ **Search results are clickable and jump to correct location**

## 📊 Performance Expectations

- **Indexing**: ~1 second for small projects
- **Search**: <100ms response time
- **Hover**: Instant response
- **File updates**: Automatic re-indexing

## 🔄 Real-time Testing

1. **Edit a file**: Add a new module to `test_module.sv`
2. **Save the file**: Extension should auto-update index
3. **Search for new module**: Should find it immediately
4. **Check hover**: Should work on new module

Your extension is now ready for production use! 🚀
