// Worker entry: importing the monaco language worker module wires up
// `self.onmessage` for the matching language service.
import "monaco-editor/esm/vs/language/typescript/ts.worker.js";

export {};
