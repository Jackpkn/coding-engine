import { Parser } from "web-tree-sitter";
const { Language } = require("web-tree-sitter");
/**
 * Use InstanceType<typeof Parser> so TS understands the runtime type of parser.
 * This avoids "Cannot use namespace 'Parser' as a type" errors.
 */
export type VerilogParserNew = {
  parser: InstanceType<typeof Parser>;
};

async function loadLanguage(wasmPath: string) {
  return await Language.load(wasmPath);
}

let isParserInitialized = false;

async function initializeParser() {
  if (!isParserInitialized) {
    // Parser.init accepts moduleOptions if needed (e.g. locateFile)
    await Parser.init();
    isParserInitialized = true;
  }
}

/**
 * Load a SystemVerilog parser using the newer web-tree-sitter import style.
 */
export async function loadVerilogParserNew(
  wasmPath: string
): Promise<VerilogParserNew> {
  await initializeParser();
  console.log("Loading SystemVerilog WASM from", wasmPath);
  try {
    const language = await loadLanguage(wasmPath);
    console.log("Language loaded:", language);
    const parser = new Parser();
    parser.setLanguage(language);
    console.log("Parser ready");
    return { parser };
  } catch (err) {
    console.error("Parser load failed:", err);
    throw err;
  }
}
