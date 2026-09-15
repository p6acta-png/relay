import { AppError } from '@/lib/errors';
import { pollConversation } from '@/modules/conversations/pipeline';
import { enforceRateLimit, RATE_LIMITS, rateLimitSubject } from '@/modules/protection/rate-limit';
import { clientIpFrom, jsonError, noStore } from '@/server/http';

/** GET /api/public/{slug}/chat/{conversationId}?after={messageId} — new messages, e.g. a staff reply. */
export async function GET(request: Request, ctx: RouteContext<'/api/public/[slug]/chat/[conversationId]'>) {
  try {
    const { slug, conversationId } = await ctx.params;
    const token = request.headers.get('x-relay-conversation-token');
    if (!token) throw new AppError('NOT_FOUND', 'Conversation not found.');
    // Polling is cheap but still limited, so a script can't hammer the database.
    await enforceRateLimit(RATE_LIMITS.chatPollByIp, rateLimitSubject(clientIpFrom(request)));

    const after = new URL(request.url).searchParams.get('after');
    const result = await pollConversation({ slug, conversationId, token, afterId: after });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return jsonError(error, 'chat.poll');
  }
}
