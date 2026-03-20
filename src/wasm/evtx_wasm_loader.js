// This file re-exports the WASM glue code from the public directory for Vite compatibility.
// It loads the WASM binary from the public/wasm directory at runtime.

import init, { EvtxWasmParser } from "./evtx_wasm.js";

export async function loadEvtxWasm() {
  await init("/wasm/evtx_wasm_bg.wasm");
  return { EvtxWasmParser };
}
