/**
 * Offline LLM Web Worker (Transformers.js)
 *
 * Mirrors the llama-3.2-webgpu example for streaming token updates.
 */
import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  PreTrainedTokenizer,
} from "@huggingface/transformers";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

// Model state
let tokenizer: PreTrainedTokenizer | null = null;
let model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>> | null = null;
let isLoaded = false;
let currentModelId = "";
let currentDevice: "webgpu" | "wasm" = "webgpu";

const stoppingCriteria = new InterruptableStoppingCriteria();
let pastKeyValuesCache: any = null;

async function supportsWebGPU(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

async function loadModel(modelId: string): Promise<void> {
  if (isLoaded && currentModelId === modelId && tokenizer && model) {
    self.postMessage({ status: "ready" });
    return;
  }

  // Clear cache when loading a new model
  pastKeyValuesCache = null;

  self.postMessage({
    status: "loading",
    data: "Loading model...",
  });

  try {
    const hasWebGPU = await supportsWebGPU();
    currentDevice = hasWebGPU ? "webgpu" : "wasm";

    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: (x) => self.postMessage(x),
    });

    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: currentDevice === "webgpu" ? "q4f16" : "q8",
      device: currentDevice,
      progress_callback: (x) => self.postMessage(x),
    });

    self.postMessage({
      status: "loading",
      data: "Compiling shaders and warming up model...",
    });

    const inputs = tokenizer("a");
    await model.generate({ ...inputs, max_new_tokens: 1 });

    currentModelId = modelId;
    isLoaded = true;
    self.postMessage({ 
      status: "ready",
      data: `Model loaded on ${currentDevice.toUpperCase()}`,
      device: currentDevice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ status: "error", data: message });
    throw error;
  }
}

async function generate(messages: ChatMessage[]): Promise<void> {
  if (!tokenizer || !model || !isLoaded) {
    self.postMessage({
      status: "error",
      data: "Model not loaded. Please load the model first.",
    });
    return;
  }

  let inputs;
  try {
    inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    });
    
    // Handle promise if apply_chat_template returns one
    if (inputs && typeof (inputs as any).then === 'function') {
      inputs = await inputs;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({
      status: "error",
      data: `Failed to tokenize messages: ${message}`,
    });
    return;
  }

  let startTime: number | undefined;
  let numTokens = 0;
  let tps: number | undefined;
  const tokenCallbackFunction = () => {
    startTime ??= performance.now();
    if (numTokens++ > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
    }
  };
  const callbackFunction = (output: string) => {
    self.postMessage({
      status: "update",
      output,
      tps,
      numTokens,
    });
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: callbackFunction,
    token_callback_function: tokenCallbackFunction,
  });

  self.postMessage({ status: "start" });

  try {
    // For now, don't use past_key_values since we're not maintaining full conversation history
    // This will be slower but more reliable until we implement proper conversation context
    const result = await model.generate({
      ...inputs,
      do_sample: false,
      max_new_tokens: 1024,
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    });

    const sequences = result.sequences || result;
    
    const decoded = tokenizer.batch_decode(sequences, {
      skip_special_tokens: true,
    });

    self.postMessage({
      status: "complete",
      output: decoded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : String(error);
    console.error("[LLM Worker] Generation error:", error);
    self.postMessage({
      status: "error",
      data: `Generation failed: ${message}. Details: ${errorDetails}`,
    });
  }
}

async function check(): Promise<void> {
  const hasWebGPU = await supportsWebGPU();
  if (!hasWebGPU) {
    self.postMessage({
      status: "info",
      data: "WebGPU not available, using WASM fallback.",
    });
  }
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case "check":
        await check();
        break;
      case "load":
        await loadModel(data.modelId);
        break;
      case "generate":
        stoppingCriteria.reset();
        await generate(data.messages);
        break;
      case "interrupt":
        stoppingCriteria.interrupt();
        break;
      case "reset":
        stoppingCriteria.reset();
        pastKeyValuesCache = null;
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ status: "error", data: message });
  }
});

export {};
