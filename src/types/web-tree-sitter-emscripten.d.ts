// Minimal declaration to satisfy TypeScript.
// You can expand it if you need actual Emscripten properties.

declare interface EmscriptenModule {
  locateFile?(path: string, scriptDirectory?: string): string;
  onRuntimeInitialized?: () => void;
  [key: string]: any; // allow arbitrary properties
}
