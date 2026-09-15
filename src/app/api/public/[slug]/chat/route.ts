import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { handleChatInput } from '@/modules/conversations/pipeline';
import { assertSameOrigin, clientIpFrom, jsonError, noStore, readJson } from '@/server/http';

const bodySchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  input: z.unknown(),
  formToken: z.string().max(200).optional(),
  website: z.string().max(200).optional(),
});

/**
 * POST /api/public/{slug}/chat — send one customer input.
 * The conversation token travels in a header, not a cookie, so another website cannot make a
 * visitor's browser send it (no CSRF), and it never ends up in server logs as part of a URL.
 */
// #region learn:chat-route
export async function POST(request: Request, ctx: RouteContext<'/api/public/[slug]/chat'>) {
  try {
    assertSameOrigin(request);
    const { slug } = await ctx.params;
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AppError('VALIDATION', 'Malformed chat request.');

    const response = await handleChatInput({
      slug,
      ip: clientIpFrom(request),
      conversationId: parsed.data.conversationId ?? null,
      token: request.headers.get('x-relay-conversation-token'),
      input: parsed.data.input,
      challenge: { formToken: parsed.data.formToken, honeypot: parsed.data.website },
    });
    return Response.json(response, { headers: noStore });
  } catch (error) {
    return jsonError(error, 'chat.post');
  }
}
// #endregion learn:chat-route
