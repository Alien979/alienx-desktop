// TypeScript wrapper for sigmaScanWorker for Vite/CRA module worker compatibility
// This file is required for importing the worker as a module in React apps

export default function createSigmaScanWorker() {
  return new Worker(new URL("./sigmaScanWorker.ts", import.meta.url), {
    type: "module",
  });
}
