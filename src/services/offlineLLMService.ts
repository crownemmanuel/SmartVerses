/**
 * Offline LLM Service
 *
 * Wraps the Transformers.js LLM worker for loading and streaming generation.
 */
type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type WorkerStatus =
  | "loading"
  | "initiate"
  | "progress"
  | "done"
  | "ready"
  | "start"
  | "update"
  | "complete"
  | "error"
  | "info";

export interface OfflineLLMCallbacks {
  onStatus?: (status: WorkerStatus, data?: string) => void;
  onProgress?: (data: { file?: string; progress?: number; loaded?: number; total?: number }) => void;
  onToken?: (token: string, stats?: { tps?: number; numTokens?: number }) => void;
}

class OfflineLLMService {
  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private currentModelId: string | null = null;

  private initWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("../workers/llmWorker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.postMessage({ type: "check" });
    }
    return this.worker;
  }

  async loadModel(modelId: string, callbacks?: OfflineLLMCallbacks): Promise<void> {
    if (this.currentModelId === modelId && this.loadPromise) {
      return this.loadPromise;
    }

    const worker = this.initWorker();
    this.currentModelId = modelId;

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        const { status, data, file, progress, loaded, total } = event.data || {};

        switch (status as WorkerStatus) {
          case "loading":
            callbacks?.onStatus?.("loading", data);
            break;
          case "initiate":
          case "progress":
          case "done":
            callbacks?.onProgress?.({ file, progress, loaded, total });
            break;
          case "ready":
            // Pass device info if available
            const device = (event.data as any)?.device;
            callbacks?.onStatus?.("ready", event.data?.data || (device ? `Model loaded on ${device.toUpperCase()}` : undefined));
            cleanup();
            resolve();
            break;
          case "error":
            cleanup();
            reject(new Error(data || "Failed to load model"));
            break;
          case "info":
            callbacks?.onStatus?.("info", data);
            break;
        }
      };

      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
      };

      worker.addEventListener("message", handleMessage);
      worker.postMessage({ type: "load", data: { modelId } });
    });

    return this.loadPromise;
  }

  async generate(
    modelId: string,
    messages: ChatMessage[],
    callbacks?: OfflineLLMCallbacks
  ): Promise<string> {
    await this.loadModel(modelId, callbacks);
    const worker = this.initWorker();

    return new Promise<string>((resolve, reject) => {
      let finalText = "";
      let streamedText = "";

      const handleMessage = (event: MessageEvent) => {
        const { status, output, tps, numTokens, data } = event.data || {};

        switch (status as WorkerStatus) {
          case "start":
            callbacks?.onStatus?.("start");
            break;
          case "update":
            if (typeof output === "string") {
              streamedText += output;
              callbacks?.onToken?.(output, { tps, numTokens });
            }
            break;
          case "complete":
            finalText = streamedText.length
              ? streamedText
              : Array.isArray(output)
              ? output.join("")
              : String(output || "");
            cleanup();
            resolve(finalText);
            break;
          case "error":
            cleanup();
            reject(new Error(data || "Generation failed"));
            break;
        }
      };

      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
      };

      worker.addEventListener("message", handleMessage);
      worker.postMessage({ type: "generate", data: { messages } });
    });
  }

  interrupt(): void {
    if (!this.worker) return;
    this.worker.postMessage({ type: "interrupt" });
  }

  reset(): void {
    if (!this.worker) return;
    this.worker.postMessage({ type: "reset" });
  }
}

export const offlineLLMService = new OfflineLLMService();

export type { ChatMessage as OfflineLLMChatMessage };
