import { logger } from '@/lib/logger';
import {
  interpretationSchema,
  UNKNOWN_INTERPRETATION,
  type Interpretation,
  type InterpretationRequest,
} from './interpretation';
import { mockAIProvider } from './mock-provider';

/**
 * AI provider boundary.
 *
 * Anything that can turn a customer message into an `Interpretation` can be plugged in here:
 * the deterministic demo provider in this build, or a real language model later (see
 * docs/ai-provider.md). Providers return `unknown` on purpose — their output is treated like
 * any other untrusted input and validated before Relay acts on it.
 */
export interface AIProvider {
  readonly name: string;
  /** True for simulated providers; shown as "Demo mode" in the product. */
  readonly isDemo: boolean;
  interpret(request: InterpretationRequest, signal: AbortSignal): Promise<unknown>;
}

export function getAIProvider(): AIProvider {
  // Only the demo provider exists in this build; env validation rejects other values.
  return mockAIProvider;
}

const TIMEOUT_MS = 8_000;

export interface Understanding {
  interpretation: Interpretation;
  provider: string;
  /** Why the raw output was not used as-is, if it wasn't. */
  rejected?: 'invalid_shape' | 'unknown_reference' | 'provider_error' | 'timeout';
}

// #region learn:understand
/**
 * Asks the provider, then trusts nothing:
 *  1. shape — the output must match the schema exactly;
 *  2. references — any service or FAQ id must belong to this business's catalogue.
 * Anything that fails becomes "unknown", which the flow answers by asking or handing over.
 */
export async function understand(
  request: InterpretationRequest,
  provider: AIProvider = getAIProvider(),
): Promise<Understanding> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let raw: unknown;
  try {
    raw = await provider.interpret(request, controller.signal);
  } catch (error) {
    const rejected = controller.signal.aborted ? 'timeout' : 'provider_error';
    logger.warn('assistant.provider_failed', { provider: provider.name, rejected, error });
    return { interpretation: UNKNOWN_INTERPRETATION, provider: provider.name, rejected };
  } finally {
    clearTimeout(timer);
  }

  const parsed = interpretationSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('assistant.invalid_output', { provider: provider.name, issues: parsed.error.issues.length });
    return { interpretation: UNKNOWN_INTERPRETATION, provider: provider.name, rejected: 'invalid_shape' };
  }

  const interpretation = parsed.data;
  const serviceOk =
    !interpretation.serviceId || request.services.some((s) => s.id === interpretation.serviceId);
  const knowledgeOk =
    !interpretation.knowledgeItemId || request.knowledge.some((k) => k.id === interpretation.knowledgeItemId);
  if (!serviceOk || !knowledgeOk) {
    logger.warn('assistant.unknown_reference', { provider: provider.name });
    return { interpretation: UNKNOWN_INTERPRETATION, provider: provider.name, rejected: 'unknown_reference' };
  }
  return { interpretation, provider: provider.name };
}
// #endregion learn:understand
