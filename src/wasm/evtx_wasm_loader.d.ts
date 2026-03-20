declare module "../wasm/evtx_wasm_loader.js" {
  export async function loadEvtxWasm(): Promise<{
    EvtxWasmParser: any;
  }>;
}

export {};

