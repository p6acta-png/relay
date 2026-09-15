import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { hmacIdentifier } from '@/lib/tokens';

/**
 * Bot challenge boundary.
 *
 * A real CAPTCHA (e.g. Cloudflare Turnstile, hCaptcha) would implement `ChallengeProvider` by
 * verifying a widget token with the provider's API. This build ships only the demo provider,
 * which blocks unsophisticated bots with two cheap checks:
 *  1. a honeypot field that humans never see or fill in;
 *  2. a signed "form rendered at" timestamp — submissions faster than a human can type are rejected.
 * It does NOT stop a determined attacker; see THREAT_MODEL.md.
 */
export interface ChallengeInput {
  honeypot?: string | null;
  formToken?: string | null;
}

export interface ChallengeProvider {
  readonly name: string;
  readonly isDemo: boolean;
  /** Data the form must render (e.g. a signed timestamp or a widget site key). */
  issue(now?: Date): { formToken: string };
  verify(input: ChallengeInput, now?: Date): { ok: true } | { ok: false; reason: string };
}

const MIN_HUMAN_MS = 1_500;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function sign(timestamp: string): string {
  return hmacIdentifier(`form:${timestamp}`, env.APP_SECRET);
}

export const demoChallengeProvider: ChallengeProvider = {
  name: 'demo',
  isDemo: true,
  issue(now = new Date()) {
    const timestamp = String(now.getTime());
    return { formToken: `${timestamp}.${sign(timestamp)}` };
  },
  verify(input, now = new Date()) {
    if (input.honeypot) return { ok: false, reason: 'honeypot' };
    const [timestamp, signature] = (input.formToken ?? '').split('.');
    if (!timestamp || !signature) return { ok: false, reason: 'missing-token' };
    const expected = Buffer.from(sign(timestamp));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, reason: 'bad-signature' };
    }
    const age = now.getTime() - Number(timestamp);
    if (age < MIN_HUMAN_MS) return { ok: false, reason: 'too-fast' };
    if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
    return { ok: true };
  },
};

export function getChallengeProvider(): ChallengeProvider {
  // Only 'demo' exists in this build; env validation rejects anything else.
  return demoChallengeProvider;
}

export function enforceChallenge(input: ChallengeInput): void {
  const result = getChallengeProvider().verify(input);
  if (!result.ok) {
    throw new AppError(
      'CHALLENGE_FAILED',
      result.reason === 'expired'
        ? 'This form has expired. Please reload the page and try again.'
        : 'We could not verify this submission. Please wait a moment and try again.',
    );
  }
}
