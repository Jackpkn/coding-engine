import * as vscode from "vscode";
import * as path from "path";
import { VerilogApiClient, SearchResult } from "./apiClient";
import { GroqLLMService, FallbackLLMService, CodeContext } from "./llmService";

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: number;
  results?: SearchResult[];
}

export async function activate(context: vscode.ExtensionContext) {
  const apiClient = new VerilogApiClient();
  let chatPanel: vscode.WebviewPanel | undefined;
  let chatHistory: ChatMessage[] = [];

  // Initialize LLM services
  const config = vscode.workspace.getConfiguration("verilog");
  const groqApiKey =
    config.get<string>("groqApiKey") || process.env.GROQ_API_KEY;
  const enableLLM = config.get<boolean>("enableLLM", true);

  const groqService = new GroqLLMService(groqApiKey);
  const fallbackService = new FallbackLLMService();
  const llmService =
    enableLLM && groqService.isConfigured() ? groqService : fallbackService;

  console.log("Verilog Chat Extension activated");
  console.log(
    `LLM Service: ${groqService.isConfigured() ? "Groq" : "Fallback"}`
  );

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "verilog.openChat";
  statusBarItem.text = "$(comment-discussion) Verilog Chat";
  statusBarItem.tooltip = "Open Verilog Chat Assistant";
  statusBarItem.show();

  // Check API connection
  async function updateStatus() {
    try {
      await apiClient.healthCheck();
      statusBarItem.backgroundColor = undefined;
      return true;
    } catch (error) {
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      return false;
    }
  }

  await updateStatus();

  // Auto-index workspace on startup
  if (vscode.workspace.workspaceFolders) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    try {
      await apiClient.indexRepo(workspaceRoot);
      console.log("Workspace indexed for chat");
    } catch (error) {
      console.warn("Failed to auto-index workspace:", error);
    }
  }

  // Open chat command
  const openChatCmd = vscode.commands.registerCommand(
    "verilog.openChat",
    () => {
      if (chatPanel) {
        chatPanel.reveal(vscode.ViewColumn.Beside);
      } else {
        chatPanel = vscode.window.createWebviewPanel(
          "verilogChat",
          "Verilog Chat Assistant",
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
          }
        );

        chatPanel.webview.html = getChatWebviewContent();

        // Handle messages from webview
        chatPanel.webview.onDidReceiveMessage(async (message) => {
          switch (message.command) {
            case "sendMessage":
              await handleChatMessage(message.text);
              break;
            case "jumpToCode":
              await jumpToResult(message.result);
              break;
            case "clearChat":
              chatHistory = [];
              updateChatHistory();
              break;
          }
        });

        chatPanel.onDidDispose(() => {
          chatPanel = undefined;
        });
      }
    }
  );

  // Quick chat command
  const quickChatCmd = vscode.commands.registerCommand(
    "verilog.quickChat",
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Ask about your Verilog code",
        placeHolder:
          'e.g., "show me all modules", "find the ALU", "what signals connect to the CPU?"',
      });

      if (query) {
        if (!chatPanel) {
          vscode.commands.executeCommand("verilog.openChat");
          // Wait a bit for panel to open
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        await handleChatMessage(query);
      }
    }
  );

  async function handleChatMessage(userMessage: string) {
    const messageId = Date.now().toString();

    // Add user message
    const userChatMessage: ChatMessage = {
      id: messageId + "_user",
      type: "user",
      content: userMessage,
      timestamp: Date.now(),
    };
    chatHistory.push(userChatMessage);
    updateChatHistory();

    // Process the message and generate response
    const response = await processNaturalLanguageQuery(userMessage);

    // Add assistant response
    const assistantMessage: ChatMessage = {
      id: messageId + "_assistant",
      type: "assistant",
      content: response.text,
      timestamp: Date.now(),
      results: response.results,
    };
    chatHistory.push(assistantMessage);
    updateChatHistory();
  }

  async function processNaturalLanguageQuery(
    query: string
  ): Promise<{ text: string; results?: SearchResult[] }> {
    try {
      // Determine if this is a general question or code-specific
      const isCodeSpecific = isCodeSpecificQuery(query);

      if (!isCodeSpecific) {
        // Handle general Verilog questions with LLM
        const context: CodeContext = {
          query,
          searchResults: [],
          codeSnippets: [],
          modules: [],
          signals: [],
        };

        const llmResponse = await llmService.generateResponse(context);
        return {
          text: llmResponse.success
            ? llmResponse.content
            : llmResponse.error || "Failed to generate response",
        };
      }

      // For code-specific queries, search the codebase first
      const parsedQuery = parseNaturalLanguageQuery(query);
      const searchResult = await apiClient.search(
        parsedQuery.searchTerm,
        parsedQuery.type
      );

      if (!searchResult.success) {
        return {
          text: `🔌 **Connection Issue**\n\n${
            searchResult.error || "Unknown error"
          }\n\n**To fix this:**\n1. Make sure the API server is running: \`npm run server\`\n2. Check that the server is on http://localhost:3000\n3. Try running "Verilog: Index Workspace" first`,
        };
      }

      const results = searchResult.data?.results || [];

      // Gather additional context for LLM
      const context = await buildCodeContext(query, results);

      // Debug: Log context being sent to LLM
      console.log("🔍 LLM Context Debug:", {
        query: context.query,
        resultsCount: context.searchResults.length,
        codeSnippetsCount: context.codeSnippets.length,
        modulesFound: context.modules,
        signalsFound: context.signals.slice(0, 5), // Limit for readability
      });

      // Use LLM to generate intelligent response
      const llmResponse = await llmService.generateResponse(context);

      if (llmResponse.success) {
        return {
          text: llmResponse.content,
          results: results.slice(0, 10),
        };
      } else {
        // Fallback to rule-based response if LLM fails
        const fallbackText = generateNaturalLanguageResponse(
          query,
          parsedQuery,
          results
        );
        return {
          text: fallbackText,
          results: results.slice(0, 10),
        };
      }
    } catch (error) {
      return {
        text: `Sorry, I encountered an error: ${error}. Make sure the Verilog API server is running.`,
      };
    }
  }

  function parseNaturalLanguageQuery(query: string): {
    searchTerm: string;
    type?: string;
    intent: string;
  } {
    const lowerQuery = query.toLowerCase();

    // Intent detection patterns
    const patterns = [
      {
        pattern: /(?:show|find|list|get).*(?:all|every).*modules?/i,
        intent: "list_modules",
        type: "symbol",
        searchTerm: "module",
      },
      {
        pattern: /(?:show|find|list|get).*(?:all|every).*functions?/i,
        intent: "list_functions",
        type: "symbol",
        searchTerm: "function",
      },
      {
        pattern: /(?:show|find|list|get).*(?:all|every).*signals?/i,
        intent: "list_signals",
        type: "symbol",
        searchTerm: "logic",
      },
      {
        pattern: /(?:show|find|list|get).*(?:all|every).*ports?/i,
        intent: "list_ports",
        type: "symbol",
        searchTerm: "input",
      },

      {
        pattern: /(?:find|show|where).*(?:alu|arithmetic)/i,
        intent: "find_alu",
        type: "symbol",
        searchTerm: "alu",
      },
      {
        pattern: /(?:find|show|where).*(?:cpu|processor|core)/i,
        intent: "find_cpu",
        type: "symbol",
        searchTerm: "cpu",
      },
      {
        pattern: /(?:find|show|where).*(?:memory|mem|cache)/i,
        intent: "find_memory",
        type: "symbol",
        searchTerm: "memory",
      },
      {
        pattern: /(?:find|show|where).*(?:controller|control)/i,
        intent: "find_controller",
        type: "symbol",
        searchTerm: "controller",
      },

      {
        pattern: /(?:what|which).*signals?.*connect.*to/i,
        intent: "find_connections",
        type: "text",
        searchTerm: extractConnectionTarget(query),
      },
      {
        pattern: /(?:how|what).*(?:does|is).*(\w+).*(?:work|do|used)/i,
        intent: "explain_module",
        type: "symbol",
        searchTerm: extractModuleName(query),
      },

      {
        pattern: /(?:input|inputs)/i,
        intent: "find_inputs",
        type: "symbol",
        searchTerm: "input",
      },
      {
        pattern: /(?:output|outputs)/i,
        intent: "find_outputs",
        type: "symbol",
        searchTerm: "output",
      },
      {
        pattern: /(?:wire|wires)/i,
        intent: "find_wires",
        type: "symbol",
        searchTerm: "wire",
      },
      {
        pattern: /(?:register|registers|reg)/i,
        intent: "find_registers",
        type: "symbol",
        searchTerm: "reg",
      },
    ];

    // Find matching pattern
    for (const { pattern, intent, type, searchTerm } of patterns) {
      if (pattern.test(query)) {
        return { searchTerm, type, intent };
      }
    }

    // Extract key terms if no pattern matches
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "find",
      "show",
      "get",
      "list",
    ]);
    const keywords = words.filter(
      (word) => !stopWords.has(word) && word.length > 2
    );

    return {
      searchTerm: keywords.join(" ") || query,
      intent: "general_search",
    };
  }

  function extractConnectionTarget(query: string): string {
    const match = query.match(/connect.*to\s+(\w+)/i);
    return match ? match[1] : "connection";
  }

  function extractModuleName(query: string): string {
    const words = query.split(/\s+/);
    const moduleWords = words.filter(
      (word) =>
        /^[a-zA-Z_]\w*$/.test(word) &&
        ![
          "what",
          "how",
          "does",
          "is",
          "work",
          "do",
          "used",
          "the",
          "a",
          "an",
        ].includes(word.toLowerCase())
    );
    return moduleWords[0] || "module";
  }

  function generateNaturalLanguageResponse(
    originalQuery: string,
    parsedQuery: any,
    results: SearchResult[]
  ): string {
    const count = results.length;
    const { intent, searchTerm } = parsedQuery;

    let response = "";

    switch (intent) {
      case "list_modules":
        // Filter for actual modules, not instances
        const modules = results.filter(
          (r) =>
            r.symbol?.kind === "module" ||
            (r.snippet && r.snippet.match(/^\s*module\s+\w+/i))
        );

        if (modules.length === 0) {
          // Try a different search approach
          response = `Let me search more specifically for modules...\n\n`;
          const moduleResults = results.filter(
            (r) =>
              r.snippet &&
              r.snippet.includes("module ") &&
              !r.snippet.includes("endmodule")
          );

          if (moduleResults.length > 0) {
            response += `I found ${moduleResults.length} modules:\n\n`;
            moduleResults.slice(0, 5).forEach((r, i) => {
              const moduleName =
                extractModuleNameFromSnippet(r.snippet) ||
                r.symbol?.name ||
                "Unknown";
              response += `${i + 1}. **${moduleName}** - ${path.basename(
                r.file
              )}:${r.line + 1}\n`;
            });
          } else {
            response += `No modules found. Try indexing your workspace first with "Verilog: Index Workspace".`;
          }
        } else {
          response = `I found ${modules.length} modules in your codebase:\n\n`;
          modules.slice(0, 5).forEach((r, i) => {
            response += `${i + 1}. **${r.symbol!.name}** - ${path.basename(
              r.file
            )}:${r.line + 1}\n`;
          });
          if (modules.length > 5) {
            response += `\n...and ${modules.length - 5} more modules.`;
          }
        }
        break;

      case "find_alu":
        response = `I found ${count} ALU-related items:\n\n`;
        results.slice(0, 3).forEach((r, i) => {
          response += `${i + 1}. **${r.symbol?.name || "Match"}** (${
            r.symbol?.kind || r.type
          }) - ${path.basename(r.file)}:${r.line + 1}\n`;
          if (r.snippet) {
            response += `   \`${r.snippet.trim()}\`\n`;
          }
        });
        break;

      case "find_cpu":
        response = `I found ${count} CPU-related components:\n\n`;
        results.slice(0, 3).forEach((r, i) => {
          response += `${i + 1}. **${r.symbol?.name || "Match"}** (${
            r.symbol?.kind || r.type
          }) - ${path.basename(r.file)}:${r.line + 1}\n`;
        });
        break;

      case "find_memory":
        response = `I found ${count} memory-related components:\n\n`;
        results.slice(0, 3).forEach((r, i) => {
          response += `${i + 1}. **${r.symbol?.name || "Match"}** (${
            r.symbol?.kind || r.type
          }) - ${path.basename(r.file)}:${r.line + 1}\n`;
        });
        break;

      case "find_inputs":
        const inputs = results.filter(
          (r) => r.symbol?.kind === "port" || r.snippet.includes("input")
        );
        response = `I found ${inputs.length} input signals:\n\n`;
        inputs.slice(0, 5).forEach((r, i) => {
          response += `${i + 1}. **${
            r.symbol?.name || "Input"
          }** - ${path.basename(r.file)}:${r.line + 1}\n`;
        });
        break;

      case "find_outputs":
        const outputs = results.filter(
          (r) => r.symbol?.kind === "port" || r.snippet.includes("output")
        );
        response = `I found ${outputs.length} output signals:\n\n`;
        outputs.slice(0, 5).forEach((r, i) => {
          response += `${i + 1}. **${
            r.symbol?.name || "Output"
          }** - ${path.basename(r.file)}:${r.line + 1}\n`;
        });
        break;

      case "explain_module":
        const moduleResults = results.filter(
          (r) => r.symbol?.kind === "module"
        );
        if (moduleResults.length > 0) {
          const module = moduleResults[0];
          response = `**${
            module.symbol!.name
          }** is a module in your design:\n\n`;
          response += `📍 Location: ${path.basename(module.file)}:${
            module.line + 1
          }\n`;
          response += `📝 Code: \`${module.snippet}\`\n\n`;
          response += `This module appears to be used for ${inferModulePurpose(
            module.symbol!.name,
            module.snippet
          )}.`;
        } else {
          response = `I couldn't find a module named "${searchTerm}". Here are similar matches:\n\n`;
          results.slice(0, 3).forEach((r, i) => {
            response += `${i + 1}. **${
              r.symbol?.name || "Match"
            }** - ${path.basename(r.file)}:${r.line + 1}\n`;
          });
        }
        break;

      default:
        response = `I found ${count} results for "${originalQuery}":\n\n`;
        results.slice(0, 5).forEach((r, i) => {
          response += `${i + 1}. **${r.symbol?.name || "Match"}** (${
            r.symbol?.kind || r.type
          }) - ${path.basename(r.file)}:${r.line + 1}\n`;
          if (r.snippet) {
            response += `   \`${r.snippet.trim()}\`\n`;
          }
        });
        if (count > 5) {
          response += `\n...and ${count - 5} more results.`;
        }
    }

    response += "\n\n💡 Click on any result below to jump to the code!";
    return response;
  }

  function extractModuleNameFromSnippet(snippet: string): string | null {
    const match = snippet.match(/module\s+(\w+)/i);
    return match ? match[1] : null;
  }

  function extractFromConversational(query: string): string {
    // Extract key terms from conversational queries
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      "can",
      "you",
      "could",
      "please",
      "extract",
      "find",
      "show",
      "me",
      "the",
      "a",
      "an",
      "what",
      "where",
      "is",
    ]);
    const keywords = words.filter(
      (word) => !stopWords.has(word) && word.length > 2
    );
    return keywords[0] || query;
  }

  function isCodeSpecificQuery(query: string): boolean {
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

  async function buildCodeContext(
    query: string,
    searchResults: SearchResult[]
  ): Promise<CodeContext> {
    const context: CodeContext = {
      query,
      searchResults,
      codeSnippets: [],
      modules: [],
      signals: [],
    };

    // For connection/hierarchy queries, get comprehensive system context
    if (isConnectionQuery(query) || query.toLowerCase().includes("module")) {
      console.log("🔍 Building comprehensive context for connection query");

      try {
        // Get all modules in the system
        const moduleSearch = await apiClient.search("module", "symbol");
        if (moduleSearch.success && moduleSearch.data) {
          const allModules = moduleSearch.data.results.filter(
            (r) => r.symbol?.kind === "module"
          );
          console.log(`Found ${allModules.length} modules for context`);

          // Add all module names
          allModules.forEach((r) => {
            if (r.symbol) {
              context.modules.push(r.symbol.name);
            }
          });
        }

        // Search for instantiation patterns to understand connections
        const instancePatterns = [
          "u_cpu",
          "u_cache",
          "u_memory",
          "cpu_core u_cpu",
          "cache_controller u_cache",
          "memory_controller u_memory",
        ];
        for (const pattern of instancePatterns) {
          const instSearch = await apiClient.search(pattern);
          if (instSearch.success && instSearch.data) {
            instSearch.data.results.forEach((result) => {
              if (
                result.snippet &&
                result.snippet.length > 10 &&
                !result.snippet.includes("instance module") &&
                !result.snippet.includes("instance instance")
              ) {
                context.codeSnippets.push(
                  `${result.file.split("/").pop()}:${result.line + 1} - ${
                    result.snippet
                  }`
                );
              }
            });
          }
        }

        // Search for connection-related terms
        const connectionTerms = [
          "assign",
          ".clk",
          ".rst_n",
          "mem_addr",
          "cpu_data",
        ];
        for (const term of connectionTerms) {
          const connSearch = await apiClient.search(term);
          if (connSearch.success && connSearch.data) {
            connSearch.data.results.slice(0, 3).forEach((result) => {
              if (
                result.snippet &&
                (result.snippet.includes(".") ||
                  result.snippet.includes("assign")) &&
                result.snippet.length > 5 &&
                !result.snippet.includes("port ") &&
                !result.snippet.includes("register ")
              ) {
                context.codeSnippets.push(
                  `${result.file.split("/").pop()}:${result.line + 1} - ${
                    result.snippet
                  }`
                );
              }
            });
          }
        }
      } catch (error) {
        console.warn("Failed to build comprehensive context:", error);
      }
    } else {
      // Regular context building for other queries
      searchResults.forEach((result) => {
        if (result.snippet) {
          context.codeSnippets.push(
            `${result.file.split("/").pop()}:${result.line + 1} - ${
              result.snippet
            }`
          );
        }

        if (result.symbol) {
          if (result.symbol.kind === "module") {
            context.modules.push(result.symbol.name);
          } else if (
            result.symbol.kind === "signal" ||
            result.symbol.kind === "port"
          ) {
            context.signals.push(result.symbol.name);
          }
        }
      });
    }

    // Remove duplicates and limit for performance
    context.modules = [...new Set(context.modules)];
    context.signals = [...new Set(context.signals)];
    context.codeSnippets = [...new Set(context.codeSnippets)].slice(0, 20); // Limit to 20 most relevant

    console.log(
      `Built context: ${context.modules.length} modules, ${context.codeSnippets.length} code snippets`
    );
    return context;
  }

  function isConnectionQuery(query: string): boolean {
    const connectionPatterns = [
      /how.*modules.*connect/i,
      /how.*are.*modules.*connect/i,
      /modules.*connect/i,
      /module.*connection/i,
      /connect.*module/i,
      /instantiat/i,
      /hierarchy/i,
      /system.*structure/i,
      /top.*level/i,
      /how.*work.*together/i,
      /signal.*flow/i,
      /system.*architecture/i,
      /design.*structure/i,
    ];

    const isConnection = connectionPatterns.some((pattern) =>
      pattern.test(query)
    );
    console.log(`🔍 Query "${query}" is connection query: ${isConnection}`);
    return isConnection;
  }

  function inferModulePurpose(name: string, snippet: string): string {
    const lowerName = name.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();

    if (lowerName.includes("alu") || lowerSnippet.includes("arithmetic")) {
      return "arithmetic and logic operations";
    }
    if (lowerName.includes("cpu") || lowerName.includes("core")) {
      return "central processing and instruction execution";
    }
    if (lowerName.includes("memory") || lowerName.includes("mem")) {
      return "data storage and memory management";
    }
    if (lowerName.includes("cache")) {
      return "fast data caching and access optimization";
    }
    if (lowerName.includes("controller") || lowerName.includes("ctrl")) {
      return "system control and coordination";
    }
    if (lowerName.includes("decoder")) {
      return "signal decoding and interpretation";
    }
    if (lowerName.includes("mux") || lowerName.includes("multiplexer")) {
      return "signal selection and routing";
    }
    if (lowerName.includes("register") || lowerName.includes("reg")) {
      return "data storage and state management";
    }

    return "digital logic processing";
  }

  function updateChatHistory() {
    if (chatPanel) {
      chatPanel.webview.postMessage({
        command: "updateHistory",
        history: chatHistory,
      });
    }
  }

  async function jumpToResult(result: SearchResult) {
    try {
      let filePath = result.file;
      if (!path.isAbsolute(filePath)) {
        if (vscode.workspace.workspaceFolders) {
          const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
          filePath = path.resolve(workspaceRoot, filePath);
        }
      }

      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(
        document,
        vscode.ViewColumn.One
      );

      const position = new vscode.Position(result.line, result.column || 0);
      const range = new vscode.Range(position, position);

      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      vscode.window.showInformationMessage(
        `Jumped to ${result.symbol?.name || "match"} in ${path.basename(
          result.file
        )}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to jump to result: ${error}`);
    }
  }

  function getChatWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verilog Chat Assistant</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background-color: var(--vscode-titleBar-activeBackground);
            color: var(--vscode-titleBar-activeForeground);
            padding: 10px 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 12px;
            word-wrap: break-word;
        }
        
        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .message.assistant {
            align-self: flex-start;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }
        
        .message-content {
            white-space: pre-wrap;
            line-height: 1.4;
        }
        
        .results {
            margin-top: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 10px;
        }
        
        .result-item {
            padding: 8px 12px;
            margin: 4px 0;
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s;
        }
        
        .result-item:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
        }
        
        .result-name {
            font-weight: bold;
            color: var(--vscode-symbolIcon-moduleForeground);
        }
        
        .result-location {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
        }
        
        .input-container {
            padding: 15px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }
        
        .input-row {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }
        
        .chat-input {
            flex: 1;
            min-height: 36px;
            max-height: 120px;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
            resize: vertical;
        }
        
        .send-button, .clear-button {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            font-family: inherit;
            white-space: nowrap;
        }
        
        .send-button:hover, .clear-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .clear-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .examples {
            margin-top: 10px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        .example {
            display: inline-block;
            margin: 2px 4px;
            padding: 4px 8px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            cursor: pointer;
            font-size: 0.8em;
        }
        
        .example:hover {
            opacity: 0.8;
        }
        
        .timestamp {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            margin-top: 50px;
        }
        
        .empty-state h3 {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>🤖 Verilog Chat Assistant</h3>
        <button class="clear-button" onclick="clearChat()">Clear Chat</button>
    </div>
    
    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h3>👋 Hello! I'm your Verilog code assistant</h3>
            <p>Ask me anything about your Verilog codebase using natural language!</p>
            <div class="examples">
                <div class="example" onclick="sendExample('show me all modules')">show me all modules</div>
                <div class="example" onclick="sendExample('find the ALU')">find the ALU</div>
                <div class="example" onclick="sendExample('what does cpu_core do?')">what does cpu_core do?</div>
                <div class="example" onclick="sendExample('list all input signals')">list all input signals</div>
            </div>
        </div>
    </div>
    
    <div class="input-container">
        <div class="input-row">
            <textarea 
                class="chat-input" 
                id="chatInput" 
                placeholder="Ask about your Verilog code... (e.g., 'show me all modules', 'find the ALU')"
                rows="1"
            ></textarea>
            <button class="send-button" onclick="sendMessage()">Send</button>
        </div>
        <div class="examples">
            Try: "show me all modules", "find the ALU", "what signals connect to CPU?", "list all input ports"
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let chatHistory = [];

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateHistory':
                    chatHistory = message.history;
                    renderChat();
                    break;
            }
        });

        function sendMessage() {
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (text) {
                vscode.postMessage({
                    command: 'sendMessage',
                    text: text
                });
                input.value = '';
                input.style.height = 'auto';
            }
        }

        function sendExample(text) {
            vscode.postMessage({
                command: 'sendMessage',
                text: text
            });
        }

        function clearChat() {
            vscode.postMessage({
                command: 'clearChat'
            });
        }

        function jumpToCode(result) {
            vscode.postMessage({
                command: 'jumpToCode',
                result: result
            });
        }

        function renderChat() {
            const container = document.getElementById('chatContainer');
            
            if (chatHistory.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <h3>👋 Hello! I'm your Verilog code assistant</h3>
                        <p>Ask me anything about your Verilog codebase using natural language!</p>
                        <div class="examples">
                            <div class="example" onclick="sendExample('show me all modules')">show me all modules</div>
                            <div class="example" onclick="sendExample('find the ALU')">find the ALU</div>
                            <div class="example" onclick="sendExample('what does cpu_core do?')">what does cpu_core do?</div>
                            <div class="example" onclick="sendExample('list all input signals')">list all input signals</div>
                        </div>
                    </div>
                \`;
                return;
            }

            container.innerHTML = chatHistory.map(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                let content = \`
                    <div class="message \${msg.type}">
                        <div class="message-content">\${escapeHtml(msg.content)}</div>
                        <div class="timestamp">\${time}</div>
                \`;

                if (msg.results && msg.results.length > 0) {
                    content += '<div class="results">';
                    msg.results.forEach(result => {
                        const name = result.symbol?.name || 'Match';
                        const kind = result.symbol?.kind || result.type;
                        const file = result.file.split('/').pop();
                        const line = result.line + 1;
                        
                        content += \`
                            <div class="result-item" onclick="jumpToCode(\${JSON.stringify(result).replace(/"/g, '&quot;')})">
                                <span class="result-name">\${escapeHtml(name)}</span>
                                <span class="result-location">(\${escapeHtml(kind)}) - \${escapeHtml(file)}:\${line}</span>
                            </div>
                        \`;
                    });
                    content += '</div>';
                }

                content += '</div>';
                return content;
            }).join('');

            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Handle Enter key
        document.getElementById('chatInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        document.getElementById('chatInput').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    </script>
</body>
</html>`;
  }

  context.subscriptions.push(openChatCmd, quickChatCmd, statusBarItem);
}

export function deactivate() {
  console.log("Verilog Chat Extension deactivated");
}
