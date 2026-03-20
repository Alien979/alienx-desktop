import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Plugin to copy samples folder to dist during build

// Plugin to copy samples and WASM files to dist during build
function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    closeBundle() {
      // Copy EVTX samples
      const shouldExclude = (entry) =>
        entry.startsWith(".") ||
        [
          ".git",
          ".gitignore",
          ".DS_Store",
          "Thumbs.db",
          "desktop.ini",
        ].includes(entry);
      const shouldIncludeFile = (filename) =>
        filename.toLowerCase().endsWith(".evtx");
      const copyRecursive = (src, dest) => {
        try {
          mkdirSync(dest, { recursive: true });
          const entries = readdirSync(src);
          for (const entry of entries) {
            if (shouldExclude(entry)) continue;
            const srcPath = join(src, entry);
            const destPath = join(dest, entry);
            if (statSync(srcPath).isDirectory()) {
              copyRecursive(srcPath, destPath);
            } else {
              if (shouldIncludeFile(entry)) {
                copyFileSync(srcPath, destPath);
                console.log(`Copied: ${srcPath} -> ${destPath}`);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to copy samples: ${error}`);
        }
      };
      copyRecursive("samples", "dist/samples");

      // Copy WASM and JS glue files to both dist/wasm and public/wasm
      const wasmSrcDir = join(__dirname, "src", "wasm");
      const wasmDistDir = join(__dirname, "dist", "wasm");
      const wasmPublicDir = join(__dirname, "public", "wasm");
      mkdirSync(wasmDistDir, { recursive: true });
      mkdirSync(wasmPublicDir, { recursive: true });
      ["evtx_wasm.js", "evtx_wasm_bg.wasm"].forEach((file) => {
        try {
          copyFileSync(join(wasmSrcDir, file), join(wasmDistDir, file));
          copyFileSync(join(wasmSrcDir, file), join(wasmPublicDir, file));
          console.log(
            `Copied: ${join(wasmSrcDir, file)} -> ${join(wasmDistDir, file)}`,
          );
          console.log(
            `Copied: ${join(wasmSrcDir, file)} -> ${join(wasmPublicDir, file)}`,
          );
        } catch (e) {
          console.warn(`Failed to copy WASM asset: ${file}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyAssetsPlugin()],

  // Enable WASM support
  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    exclude: ["evtx_wasm.js"],
  },

  // Build configuration
  build: {
    rollupOptions: {
      output: {
        // Code splitting - separate chunks for LLM providers and heavy UI libraries
        // Only load when user actually uses that feature
        manualChunks: {
          "vendor-llm-openai": ["openai", "jspdf"],
          "vendor-llm-anthropic": ["@anthropic-ai/sdk"],
          "vendor-llm-google": ["@google/genai"],
          "vendor-ui": ["react", "react-dom"],
          "vendor-charts": ["recharts"],
          "vendor-markdown": ["react-markdown"],
        },
      },
    },
  },

  server: {
    fs: {
      // Allow serving files from samples and public
      allow: [".."],
    },
    proxy: {
      "/api/abuseipdb": {
        target: "https://api.abuseipdb.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/abuseipdb/, ""),
        secure: true,
      },
    },
  },
});
