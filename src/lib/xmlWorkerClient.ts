import { ParsedData } from "../types";
import { parseLogFile } from "../parser";

interface ParseLogOptions {
  compactMode?: boolean;
  maxEvents?: number;
  maxEventDataFields?: number;
  maxRawLineLength?: number;
}

type XmlParseWorkerResponse =
  | { type: "progress"; processed: number; total: number }
  | { type: "done"; parsedData: ParsedData }
  | { type: "error"; error: string };

export function parseXmlInWorker(
  xmlContent: string,
  filename: string,
  options: ParseLogOptions | undefined,
  onProgress?: (processed: number, total: number) => void,
): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      try {
        resolve(parseLogFile(xmlContent, onProgress, filename, options));
      } catch (error) {
        reject(error);
      }
      return;
    }

    const worker = new Worker(
      new URL("../workers/xmlParseWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.onmessage = (event: MessageEvent<XmlParseWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.processed, message.total);
        return;
      }

      if (message.type === "done") {
        worker.terminate();
        resolve(message.parsedData);
        return;
      }

      worker.terminate();
      reject(new Error(message.error));
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "XML parse worker failed"));
    };

    worker.postMessage({
      xmlContent,
      filename,
      options,
    });
  });
}
