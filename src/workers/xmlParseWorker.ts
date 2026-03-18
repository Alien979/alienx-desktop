import { ParsedData } from "../types";
import { parseLogFile } from "../parser";

interface ParseLogOptions {
  compactMode?: boolean;
  maxEvents?: number;
  maxEventDataFields?: number;
  maxRawLineLength?: number;
}

interface XmlParseWorkerRequest {
  xmlContent: string;
  filename?: string;
  options?: ParseLogOptions;
}

type XmlParseWorkerResponse =
  | { type: "progress"; processed: number; total: number }
  | { type: "done"; parsedData: ParsedData }
  | { type: "error"; error: string };

self.onmessage = (event: MessageEvent<XmlParseWorkerRequest>) => {
  try {
    const { xmlContent, filename, options } = event.data;
    const parsedData = parseLogFile(
      xmlContent,
      (processed, total) => {
        self.postMessage({
          type: "progress",
          processed,
          total,
        } satisfies XmlParseWorkerResponse);
      },
      filename,
      options,
    );

    self.postMessage({
      type: "done",
      parsedData,
    } satisfies XmlParseWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    } satisfies XmlParseWorkerResponse);
  }
};
