// Monaco ships its language/editor workers as ESM. We import them from thin
// wrapper modules (src/lib/workers/*) so bundlers compile them into dedicated
// worker chunks. These declarations keep TypeScript from type-walking the
// monaco JS sources (they are ambient here; the bundler still resolves the
// real files).
declare module "monaco-editor/esm/vs/editor/editor.worker.js" {
  export {};
}
declare module "monaco-editor/esm/vs/language/typescript/ts.worker.js" {
  export {};
}
declare module "monaco-editor/esm/vs/language/json/json.worker.js" {
  export {};
}
declare module "monaco-editor/esm/vs/language/css/css.worker.js" {
  export {};
}
declare module "monaco-editor/esm/vs/language/html/html.worker.js" {
  export {};
}
