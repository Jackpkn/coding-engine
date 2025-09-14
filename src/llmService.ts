import * as https from "https";

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface CodeContext {
  query: string;
  searchResults: any[];
  codeSnippets: string[];
  modules: string[];
  signals: string[];
}

export class GroqLLMService {
  private apiKey: string;
  private baseUrl = "https://api.groq.com/openai/v1/chat/completions";
  private model = "llama3-8b-8192"; // Fast and good for code analysis

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY || "";
  }

  async generateResponse(context: CodeContext): Promise<LLMResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        content: "",
        error:
          "Groq API key not configured. Set GROQ_API_KEY environment variable.",
      };
    }

    try {
      const prompt = this.buildPrompt(context);
      const response = await this.callGroqAPI(prompt);

      return {
        success: true,
        content: response,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private buildPrompt(context: CodeContext): string {
    const { query, searchResults, codeSnippets, modules, signals } = context;

    let prompt = `You are a helpful Verilog/SystemVerilog code assistant. Answer the user's question based on the provided codebase context.

IMPORTANT: Use ONLY the provided code snippets and context. Do NOT provide generic examples or explanations. Analyze the ACTUAL code provided.

User Question: "${query}"

Codebase Context:
`;

    // Debug: Log what context we're including
    console.log("🤖 LLM Prompt Context:", {
      hasModules: modules.length > 0,
      hasSignals: signals.length > 0,
      hasCodeSnippets: codeSnippets.length > 0,
      hasSearchResults: searchResults.length > 0,
    });

    if (modules.length > 0) {
      prompt += `\nModules found: ${modules.join(", ")}`;
    }

    if (signals.length > 0) {
      prompt += `\nSignals found: ${signals.join(", ")}`;
    }

    if (codeSnippets.length > 0) {
      prompt += `\nRelevant Code Snippets:\n`;
      codeSnippets.forEach((snippet, i) => {
        prompt += `${i + 1}. ${snippet}\n`;
      });
    }

    if (searchResults.length > 0) {
      prompt += `\nSearch Results:\n`;
      searchResults.slice(0, 5).forEach((result, i) => {
        prompt += `${i + 1}. ${result.symbol?.name || "Match"} (${
          result.symbol?.kind || result.type
        }) in ${result.file}:${result.line + 1}\n`;
        if (result.snippet) {
          prompt += `   Code: ${result.snippet}\n`;
        }
      });
    }

    prompt += `\nInstructions:
1. If this is a general programming question not specific to the codebase, provide a helpful general answer
2. If this is about the specific codebase, use the provided context to give detailed, accurate information
3. Be concise but informative
4. Use markdown formatting for better readability
5. If you mention specific code elements, reference their locations
6. If the context doesn't contain enough information, say so and suggest what the user could try

Please provide a helpful response:`;

    return prompt;
  }

  private async callGroqAPI(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
        top_p: 0.9,
      });

      const options = {
        hostname: "api.groq.com",
        port: 443,
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const response = JSON.parse(body);
            if (response.error) {
              reject(new Error(response.error.message || "API Error"));
            } else if (response.choices && response.choices[0]) {
              resolve(response.choices[0].message.content);
            } else {
              reject(new Error("Invalid API response"));
            }
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error}`));
          }
        });
      });

      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Fallback service for when Groq is not available
export class FallbackLLMService {
  async generateResponse(context: CodeContext): Promise<LLMResponse> {
    const { query, searchResults, modules } = context;

    // Simple rule-based responses
    let content = "";

    if (this.isGeneralQuestion(query)) {
      content = this.generateGeneralResponse(query);
    } else {
      content = this.generateCodeBasedResponse(query, searchResults, modules);
    }

    return {
      success: true,
      content,
    };
  }

  private isGeneralQuestion(query: string): boolean {
    const generalPatterns = [
      /what is verilog/i,
      /how to.*verilog/i,
      /verilog.*syntax/i,
      /difference between.*verilog/i,
      /verilog.*tutorial/i,
      /learn.*verilog/i,
    ];

    return generalPatterns.some((pattern) => pattern.test(query));
  }

  private generateGeneralResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("what is verilog")) {
      return `**Verilog** is a hardware description language (HDL) used to model electronic systems. It's widely used for:

- **Digital circuit design** - Describing logic gates, flip-flops, and complex digital systems
- **FPGA programming** - Configuring Field-Programmable Gate Arrays
- **ASIC design** - Creating Application-Specific Integrated Circuits
- **Simulation and verification** - Testing digital designs before hardware implementation

**SystemVerilog** is an extension of Verilog with additional features for verification and system-level modeling.`;
    }

    if (lowerQuery.includes("syntax")) {
      return `**Basic Verilog Syntax:**

\`\`\`verilog
// Module declaration
module module_name (
    input  wire clk,
    input  wire reset,
    output reg  data_out
);

// Always block
always @(posedge clk) begin
    if (reset) begin
        data_out <= 1'b0;
    end else begin
        data_out <= ~data_out;
    end
end

endmodule
\`\`\`

Key elements: modules, ports, always blocks, assign statements, and data types (wire, reg, logic).`;
    }

    return `I understand you're asking about Verilog in general. For specific help with your codebase, try asking about modules, signals, or specific components in your design.`;
  }

  private generateCodeBasedResponse(
    query: string,
    searchResults: any[],
    modules: string[]
  ): string {
    if (searchResults.length === 0) {
      return `I couldn't find specific matches in your codebase for "${query}". Try:

1. **Index your workspace** first with "Verilog: Index Workspace"
2. **Be more specific** - mention module names, signal names, or specific components
3. **Check file extensions** - ensure your files use .sv, .v, .svh, or .vh extensions

Available modules in your codebase: ${
        modules.length > 0 ? modules.join(", ") : "None found"
      }`;
    }

    let response = `Based on your codebase, here's what I found for "${query}":\n\n`;

    searchResults.slice(0, 3).forEach((result, i) => {
      response += `**${i + 1}. ${result.symbol?.name || "Match"}** (${
        result.symbol?.kind || result.type
      })\n`;
      response += `📍 Location: ${result.file.split("/").pop()}:${
        result.line + 1
      }\n`;
      if (result.snippet) {
        response += `💻 Code: \`${result.snippet.trim()}\`\n\n`;
      }
    });

    response += `💡 Click on any result above to jump to the code location!`;
    return response;
  }

  isConfigured(): boolean {
    return true; // Fallback is always available
  }
}
