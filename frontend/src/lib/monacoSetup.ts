"use client";

interface MonacoEnvironmentShape {
  MonacoEnvironment: {
    getWorker(_moduleId: string, label: string): Worker;
  };
}

/**
 * Point Monaco at web workers bundled with the app (no runtime CDN). Called
 * once, client-side, right before loader.config({ monaco }) is applied.
 *
 * Workers are created with `new Worker(new URL(...))`, which Next.js
 * (Turbopack/webpack) compiles into self-contained worker chunks.
 */
export function configureMonacoWorkers(): void {
  (self as unknown as MonacoEnvironmentShape).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      switch (label) {
        case "json":
          return new Worker(new URL("./workers/jsonWorker.ts", import.meta.url), {
            type: "module",
          });
        case "css":
        case "scss":
        case "less":
          return new Worker(new URL("./workers/cssWorker.ts", import.meta.url), {
            type: "module",
          });
        case "html":
        case "handlebars":
        case "razor":
          return new Worker(new URL("./workers/htmlWorker.ts", import.meta.url), {
            type: "module",
          });
        case "typescript":
        case "javascript":
          return new Worker(new URL("./workers/tsWorker.ts", import.meta.url), {
            type: "module",
          });
        default:
          return new Worker(new URL("./workers/editorWorker.ts", import.meta.url), {
            type: "module",
          });
      }
    },
  };
}
