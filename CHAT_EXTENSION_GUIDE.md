# 🤖 Verilog Chat Assistant - User Guide

## 🚀 Overview

Your new Verilog Chat Extension provides an AI-like chat interface that understands natural language queries about your Verilog codebase. Ask questions in plain English and get intelligent responses with clickable results!

## 🎯 Key Features

- **Natural Language Processing**: Ask questions like "show me all modules" or "find the ALU"
- **Intelligent Search**: Automatically determines what to search for based on your query
- **Interactive Results**: Click on any result to jump directly to the code
- **Context Awareness**: Understands Verilog-specific terminology and concepts
- **Real-time Chat**: Instant responses with formatted results

## 🔧 How to Use

### Method 1: Open Chat Panel

1. **Command Palette**: `Ctrl+Shift+P` → "Verilog: Open Chat Assistant"
2. **Keyboard Shortcut**: `Ctrl+Shift+V` (Cmd+Shift+V on Mac)
3. **Status Bar**: Click the "🤖 Verilog Chat" button in the bottom-right

### Method 2: Quick Chat

1. **Command Palette**: `Ctrl+Shift+P` → "Verilog: Quick Chat"
2. **Keyboard Shortcut**: `Ctrl+Alt+V` (Cmd+Alt+V on Mac)
3. Type your question in the input box

## 💬 Natural Language Examples

### 🔍 **Finding Components**

```
"show me all modules"
"find the ALU"
"where is the CPU core?"
"find memory controller"
"show me cache components"
```

### 📊 **Listing Elements**

```
"list all input signals"
"show me all output ports"
"find all wire declarations"
"list all registers"
"show me all functions"
```

### 🔗 **Understanding Connections**

```
"what signals connect to the CPU?"
"show me ALU connections"
"find signals connected to memory"
```

### ❓ **Explaining Code**

```
"what does cpu_core do?"
"how does the ALU work?"
"explain the memory controller"
"what is cache_controller used for?"
```

### 🎯 **Specific Searches**

```
"find arithmetic operations"
"show me control signals"
"find clock domains"
"list reset signals"
```

## 🧠 How It Works

### 1. **Intent Recognition**

The extension analyzes your natural language query to understand what you're looking for:

- **List queries**: "show all", "list", "find all" → Returns comprehensive lists
- **Find queries**: "find", "where is", "show me" → Targeted search
- **Explain queries**: "what does", "how does", "explain" → Contextual information

### 2. **Smart Search**

Based on your intent, it automatically:

- Chooses the right search type (symbol vs text)
- Extracts key terms from your query
- Filters results by relevance

### 3. **Intelligent Responses**

Generates human-like responses with:

- Contextual explanations
- Organized result lists
- Clickable code references
- Inferred module purposes

## 📋 Test Scenarios

### Scenario 1: Exploring a New Codebase

```
You: "show me all modules"
Assistant: I found 3 modules in your codebase:
1. **alu** - test_module.sv:1
2. **cpu_core** - test_module.sv:25
3. **memory_controller** - test_complex.sv:1
```

### Scenario 2: Finding Specific Components

```
You: "find the ALU"
Assistant: I found 4 ALU-related items:
1. **alu** (module) - test_module.sv:1
   `module alu (`
2. **alu** (instance) - test_module.sv:38
   `alu u_alu (`
3. **alu_result** (signal) - test_module.sv:34
   `logic [31:0] alu_result;`
```

### Scenario 3: Understanding Code

```
You: "what does cpu_core do?"
Assistant: **cpu_core** is a module in your design:
📍 Location: test_module.sv:25
📝 Code: `module cpu_core (`
This module appears to be used for central processing and instruction execution.
```

### Scenario 4: Finding Signals

```
You: "list all input signals"
Assistant: I found 8 input signals:
1. **clk** - test_module.sv:26
2. **rst_n** - test_module.sv:27
3. **instruction** - test_module.sv:28
4. **a** - test_module.sv:2
5. **b** - test_module.sv:3
```

## 🎨 Chat Interface Features

### **Message Types**

- **User messages**: Your questions (blue, right-aligned)
- **Assistant messages**: AI responses (gray, left-aligned)

### **Interactive Results**

- Click any result to jump to the code location
- Results show: Name, Type, File, Line number
- Hover effects for better UX

### **Quick Examples**

- Click example queries to try them instantly
- Common patterns provided for learning

### **Chat Management**

- Clear chat history with "Clear Chat" button
- Persistent chat during VS Code session
- Auto-scroll to latest messages

## 🔧 Troubleshooting

### Chat Not Responding

**Problem**: No response to queries
**Solution**:

1. Check status bar - should show "🤖 Verilog Chat" (not red)
2. Ensure API server is running: `npm run server`
3. Try "Verilog: Index Workspace" first

### No Search Results

**Problem**: "I couldn't find anything matching..."
**Solution**:

1. Run "Verilog: Index Workspace"
2. Check if files have `.sv`, `.v`, `.svh`, `.vh` extensions
3. Try simpler queries like "show modules"

### Can't Jump to Code

**Problem**: "Failed to jump to result"
**Solution**:

1. Ensure files exist in workspace
2. Check file permissions
3. Try opening the file manually first

## 🎯 Advanced Usage Tips

### **Be Specific**

- ❌ "find stuff"
- ✅ "find all modules"

### **Use Verilog Terms**

- ✅ "show input ports"
- ✅ "find wire declarations"
- ✅ "list all registers"

### **Ask Follow-up Questions**

```
You: "show me all modules"
Assistant: [shows 3 modules]
You: "what does alu do?"
Assistant: [explains ALU module]
```

### **Combine Concepts**

- "find memory-related modules"
- "show CPU input signals"
- "list cache controller ports"

## 🚀 Keyboard Shortcuts Summary

| Action      | Windows/Linux  | Mac           |
| ----------- | -------------- | ------------- |
| Open Chat   | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| Quick Chat  | `Ctrl+Alt+V`   | `Cmd+Alt+V`   |
| Find Symbol | `Ctrl+Shift+F` | `Cmd+Shift+F` |

## 🎉 Success Indicators

✅ **Status bar shows "🤖 Verilog Chat"**  
✅ **Chat panel opens with welcome message**  
✅ **Natural language queries return relevant results**  
✅ **Clicking results jumps to correct code locations**  
✅ **Responses are contextual and helpful**

## 🔮 What Makes This Special

Unlike traditional search tools, this chat assistant:

1. **Understands Intent**: Knows the difference between "find ALU" and "explain ALU"
2. **Speaks Your Language**: No need to learn search syntax
3. **Provides Context**: Explains what modules do and why they matter
4. **Interactive Results**: One click to jump to any result
5. **Learns Patterns**: Recognizes common Verilog design patterns

**Your Verilog Chat Assistant is ready to help you navigate and understand your codebase like never before!** 🚀
