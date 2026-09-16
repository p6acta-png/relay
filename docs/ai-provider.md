# Connecting a real AI provider

Relay ships with a deterministic demo provider (`src/modules/assistant/mock-provider.ts`). This guide explains
how to replace it with a hosted language model **without weakening the AI boundary**. Nothing here is
implemented in this build.

## What a provider does — and does not do

A provider turns one customer message into an `Interpretation` (`src/modules/assistant/interpretation.ts`):

```ts
{
  intent: 'greeting' | 'book' | 'ask_question' | 'request_quote' | 'cancel_booking' | 'talk_to_human' | 'thanks' | 'unknown',
  confidence: number,           // 0..1
  serviceId: string | null,     // must be one of the services sent in the request
  knowledgeItemId: string | null, // must be one of the FAQ items sent in the request
  topic: 'opening_hours' | 'location' | 'prices' | 'contact' | 'none',
  time: { dateFrom, dateTo, partOfDay, exactMinute } | null, // in the business's local time
  contact: { email, phone } | null,
  summary: string,              // one line for staff, max 200 characters
  signals: string[],            // why, max 12 short strings
}
```

A provider **never** writes replies to customers, calls tools, or changes data. The conversation flow decides
what to say and do; services enforce permissions and business rules.

## The contract you implement

```ts
export interface AIProvider {
  readonly name: string;
  readonly isDemo: boolean;
  interpret(request: InterpretationRequest, signal: AbortSignal): Promise<unknown>;
}
```

`InterpretationRequest` contains only: the message, the business's local date and minute of the day, the
current conversation step, and the public catalogue (service ids, names, kinds and keywords; FAQ ids, questions
and keywords). No customer details, prices or history.

The return type is `unknown` on purpose. `understand()` in `src/modules/assistant/provider.ts` will:

1. abort the call after **8 seconds** (pass `signal` to your HTTP client);
2. validate the result against `interpretationSchema`;
3. check that `serviceId` and `knowledgeItemId` are among the ids that were sent;
4. replace anything that fails with the `unknown` interpretation and record why (`timeout`,
   `provider_error`, `invalid_shape`, `unknown_reference`).

Keep all of that unchanged.

## Steps

1. **Choose a model that supports structured output** (a JSON schema or tool/function schema the response must
   follow). Generate the JSON schema from `interpretationSchema` rather than writing it by hand, so the two
   cannot drift.

2. **Write the provider**, for example `src/modules/assistant/hosted-provider.ts`:

   ```ts
   export function createHostedProvider(config: { apiKey: string; model: string }): AIProvider {
     return {
       name: `hosted:${config.model}`,
       isDemo: false,
       async interpret(request, signal) {
         const response = await callModel({
           apiKey: config.apiKey,
           model: config.model,
           system: SYSTEM_PROMPT, // describes the fields and says: never invent ids; use "unknown" when unsure
           input: toPromptInput(request), // message + local time + step + catalogue, as JSON
           schema: INTERPRETATION_JSON_SCHEMA,
           signal,
         });
         return response.parsedJson; // untyped on purpose; understand() validates it
       },
     };
   }
   ```

   `callModel` is your provider's SDK or HTTP call. Treat the customer's message as data inside the input, never
   as part of the instructions.

3. **Wire it up.** Add a value such as `hosted` to `AI_PROVIDER` and an API key variable in `src/lib/env.ts`
   (validated, server-only), document them in `.env.example`, and return the new provider from `getAIProvider()`
   when selected. Keep `mock` as the default so tests stay deterministic.

4. **Update the product labels.** The dashboard header's "Demo mode · AI & email simulated" tag
   (`src/app/app/layout.tsx`) and `/learn/simulations` should say exactly what is still simulated. Set
   `isDemo: false` on the new provider.

5. **Test it.**
   - Keep the existing unit and integration tests on the mock provider.
   - Add a small evaluation set: recorded messages with expected intents and ids, run against the real model
     outside the normal test run, reporting accuracy and rejection rates per reason.
   - Add tests that feed hostile outputs (extra fields, wrong ids, huge strings) through `understand()`.

## Operational checklist

- **Cost and abuse:** chat rate limits already apply before understanding; add a spending limit at the provider
  and alert on unusual volume.
- **Latency:** understanding runs outside database transactions, so a slow provider does not hold locks, but the
  customer waits. Consider a faster model for interpretation.
- **Privacy:** message text will leave your infrastructure. Review the provider's data processing and retention
  terms and update your privacy information. Do not add customer details to the request.
- **Monitoring:** log provider name, latency and rejection reason (not message text) and watch the rate of
  `unknown` interpretations and hand-offs.
- **Prompt injection:** the model has no tools and its output is validated against a closed schema, so injected
  instructions cannot trigger actions. They can still cause a wrong intent — which is why bookings require an
  explicit confirmation step and unknown questions are handed to a person.
