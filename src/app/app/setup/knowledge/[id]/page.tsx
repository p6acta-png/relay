import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { withTenant } from '@/lib/db';
import { listKnowledge } from '@/modules/catalog/manage';
import { isAllowed } from '@/modules/tenancy/context';
import { requireDashboard } from '@/server/context';
import { deleteKnowledgeAction } from '../../actions';
import { KnowledgeForm } from './knowledge-form';

export const metadata: Metadata = { title: 'Answer' };

export default async function KnowledgeItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireDashboard();
  const items = await withTenant(ctx.organizationId, (scope) => listKnowledge(scope, ctx));
  const isNew = id === 'new';
  const item = isNew ? null : items.find((i) => i.id === id);
  const canManage = isAllowed(ctx, 'setup.manage');
  if ((!isNew && !item) || (isNew && !canManage)) notFound();

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/app/setup/knowledge" className="text-sm text-ink-2 hover:text-ink">
        ← Knowledge
      </Link>
      <h2 className="text-xl font-semibold">{item ? 'Edit answer' : 'New answer'}</h2>
      <KnowledgeForm
        id={item?.id ?? ''}
        canManage={canManage}
        initial={{
          question: item?.question ?? '',
          answer: item?.answer ?? '',
          keywords: item?.keywords.join(', ') ?? '',
          published: item?.published ?? true,
        }}
      />
      {item && canManage && (
        <form action={deleteKnowledgeAction} className="border-t border-rule pt-5">
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="danger" size="sm">
            Delete this answer
          </Button>
        </form>
      )}
    </div>
  );
}
