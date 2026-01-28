/**
 * Groq model token limits per day (TPD) and requests per day (RPD)
 * Based on console.groq.com limits
 */

export interface GroqModelLimits {
  tokensPerDay?: number | string; // number for TPD, string for special cases like "No TPD listed" or "No TPD (audio seconds limit instead)"
  requestsPerDay?: number;
}

const GROQ_MODEL_LIMITS: Record<string, GroqModelLimits> = {
  "allam-2-7b": { tokensPerDay: 500000, requestsPerDay: 7000 },
  "canopylabs/orpheus-arabic-saudi": { tokensPerDay: 3600, requestsPerDay: 100 },
  "canopylabs/orpheus-v1-english": { tokensPerDay: 3600, requestsPerDay: 100 },
  "groq/compound": { tokensPerDay: "No TPD listed", requestsPerDay: 250 },
  "groq/compound-mini": { tokensPerDay: "No TPD listed", requestsPerDay: 250 },
  "llama-3.1-8b-instant": { tokensPerDay: 500000, requestsPerDay: 14400 },
  "llama-3.3-70b-versatile": { tokensPerDay: 100000, requestsPerDay: 1000 },
  "meta-llama/llama-4-maverick-17b-128e-instruct": { tokensPerDay: 500000, requestsPerDay: 1000 },
  "meta-llama/llama-4-scout-17b-16e-instruct": { tokensPerDay: 500000, requestsPerDay: 1000 },
  "meta-llama/llama-guard-4-12b": { tokensPerDay: 500000, requestsPerDay: 14400 },
  "meta-llama/llama-prompt-guard-2-22m": { tokensPerDay: 500000, requestsPerDay: 14400 },
  "meta-llama/llama-prompt-guard-2-86m": { tokensPerDay: 500000, requestsPerDay: 14400 },
  "moonshotai/kimi-k2-instruct": { tokensPerDay: 300000, requestsPerDay: 1000 },
  "moonshotai/kimi-k2-instruct-0905": { tokensPerDay: 300000, requestsPerDay: 1000 },
  "openai/gpt-oss-120b": { tokensPerDay: 200000, requestsPerDay: 1000 },
  "openai/gpt-oss-20b": { tokensPerDay: 200000, requestsPerDay: 1000 },
  "openai/gpt-oss-safeguard-20b": { tokensPerDay: 200000, requestsPerDay: 1000 },
  "qwen/qwen3-32b": { tokensPerDay: 500000, requestsPerDay: 1000 },
  "whisper-large-v3": { tokensPerDay: "No TPD (audio seconds limit instead)", requestsPerDay: 2000 },
  "whisper-large-v3-turbo": { tokensPerDay: "No TPD (audio seconds limit instead)", requestsPerDay: 2000 },
};

/**
 * Get token limits for a Groq model
 */
export function getGroqModelLimits(modelId: string): GroqModelLimits | undefined {
  return GROQ_MODEL_LIMITS[modelId];
}

/**
 * Format number with K/M suffix for display
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 10000) {
    return `${(num / 1000).toFixed(0)}K`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  } else {
    return num.toString();
  }
}

/**
 * Format token limit for display in model selector labels
 * Returns a formatted string like "(500K TPD, 7K RPD)" or "(No TPD listed, 250 RPD)"
 */
export function formatGroqModelLabel(modelId: string): string {
  const limits = getGroqModelLimits(modelId);
  if (!limits) {
    return modelId;
  }

  const parts: string[] = [];

  // Format tokens per day
  if (limits.tokensPerDay) {
    if (typeof limits.tokensPerDay === "string") {
      // Special cases like "No TPD listed" or "No TPD (audio seconds limit instead)"
      parts.push(limits.tokensPerDay);
    } else {
      const formatted = formatNumber(limits.tokensPerDay);
      parts.push(`${formatted} TPD`);
    }
  }

  // Format requests per day
  if (limits.requestsPerDay) {
    const formatted = formatNumber(limits.requestsPerDay);
    parts.push(`${formatted} RPD`);
  }

  if (parts.length === 0) {
    return modelId;
  }

  return `${modelId} (${parts.join(", ")})`;
}
