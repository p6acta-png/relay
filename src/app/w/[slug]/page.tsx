import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RelayMark } from '@/components/brand/logo';
import { IconChat, IconClock, IconMail, IconMapPin } from '@/components/ui/icons';
import { withTenant } from '@/lib/db';
import { describeOpenStatus, describeOpeningHours, parseOpeningHours } from '@/modules/catalog/opening-hours';
import { formatPrice, welcomeReply } from '@/modules/conversations/flow';
import { getChallengeProvider } from '@/modules/protection/challenge';
import { getPublicOrganization } from '@/modules/tenancy/organizations';
import { ChatPanel } from './_components/chat-panel';
import { ChatProvider, OpenChatButton } from './_components/chat-provider';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const organization = await getPublicOrganization((await params).slug);
  return organization
    ? {
        title: { absolute: `${organization.name} — ${organization.tagline ?? 'Book online'}` },
        description: organization.description ?? undefined,
      }
    : { title: 'Not found' };
}

/**
 * A business's public page. It stands in for the business's own website, with Relay's chat
 * embedded. Everything shown comes from the business's settings — the same data the assistant uses.
 */
export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const organization = await getPublicOrganization(slug);
  if (!organization) notFound();

  const { services, faqs } = await withTenant(organization.id, async ({ db, organizationId }) => {
    const services = await db.service.findMany({
      where: { organizationId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const faqs = await db.knowledgeItem.findMany({
      where: { organizationId, published: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, question: true, answer: true },
    });
    return { services, faqs };
  });

  const hours = parseOpeningHours(organization.openingHours);
  const status = describeOpenStatus(hours, new Date(), organization.timezone);
  const welcome = welcomeReply({ name: organization.name });
  const cta =
    'inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 text-[0.9375rem] font-medium transition-colors';

  return (
    <ChatProvider
      slug={organization.slug}
      businessName={organization.name}
      timeZone={organization.timezone}
      welcome={welcome}
      formToken={getChallengeProvider().issue().formToken}
    >
      {organization.isDemo && (
        <div className="border-b border-signal-500/30 bg-signal-50 px-5 py-2 text-center text-[0.8125rem] text-signal-700">
          <strong className="font-semibold">Fictional business</strong> for the Relay demo. Try{' '}
          <OpenChatButton
            className="underline underline-offset-2"
            input={{ kind: 'text', text: 'Can I book a service next Tuesday afternoon?' }}
            label="Can I book a service next Tuesday afternoon?"
          >
            “Can I book a service next Tuesday afternoon?”
          </OpenChatButton>{' '}
          or{' '}
          <OpenChatButton
            className="underline underline-offset-2"
            input={{ kind: 'text', text: 'Do you offer a student discount?' }}
            label="Do you offer a student discount?"
          >
            “Do you offer a student discount?”
          </OpenChatButton>
        </div>
      )}

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href={`/w/${organization.slug}`} className="font-serif text-2xl tracking-tight">
          {organization.name}
        </Link>
        <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm text-ink-2 md:flex">
          <a href="#services" className="hover:text-ink">
            Services & prices
          </a>
          <a href="#hours" className="hover:text-ink">
            Opening hours
          </a>
          <a href="#faq" className="hover:text-ink">
            Questions
          </a>
        </nav>
        <OpenChatButton className={`${cta} h-10 bg-ink px-4 text-sm text-white hover:bg-pine-800`}>
          <IconChat className="size-4" />
          Ask or book
        </OpenChatButton>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-16 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:pt-16">
          <div>
            <p className="eyebrow">
              {[organization.addressLine, organization.city].filter(Boolean).join(', ')}
            </p>
            <h1 className="mt-4 font-serif text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] tracking-tight">
              {organization.tagline ?? organization.name}
            </h1>
            {organization.description && (
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{organization.description}</p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <OpenChatButton
                className={`${cta} bg-pine-700 text-white hover:bg-pine-800`}
                input={{ kind: 'text', text: 'I’d like to book a time' }}
                label="I’d like to book a time"
              >
                Book a time
              </OpenChatButton>
              <OpenChatButton className={`${cta} border border-rule-strong bg-surface hover:border-ink-3`}>
                Ask a question
              </OpenChatButton>
            </div>
          </div>

          <aside
            className="self-start rounded-[var(--radius-lg)] border border-rule bg-surface"
            aria-label="Today"
          >
            <div className="flex items-center gap-2 border-b border-rule px-5 py-4">
              <span
                className={`size-2 rounded-full ${status.open ? 'bg-pine-500' : 'bg-rule-strong'}`}
                aria-hidden
              />
              <p className="text-sm font-medium">{status.label}</p>
            </div>
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex gap-3">
                <dt>
                  <IconClock className="mt-0.5 size-4 text-ink-3" />
                  <span className="sr-only">Opening hours</span>
                </dt>
                <dd className="tabular space-y-0.5 font-mono text-[0.8125rem]">
                  {describeOpeningHours(hours).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </dd>
              </div>
              {(organization.addressLine || organization.city) && (
                <div className="flex gap-3">
                  <dt>
                    <IconMapPin className="mt-0.5 size-4 text-ink-3" />
                    <span className="sr-only">Address</span>
                  </dt>
                  <dd>{[organization.addressLine, organization.city].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              {organization.contactEmail && (
                <div className="flex gap-3">
                  <dt>
                    <IconMail className="mt-0.5 size-4 text-ink-3" />
                    <span className="sr-only">Email</span>
                  </dt>
                  <dd>{organization.contactEmail}</dd>
                </div>
              )}
            </dl>
          </aside>
        </section>

        <section id="services" className="border-t border-rule bg-surface" aria-labelledby="services-title">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">01 · Price list</p>
                <h2 id="services-title" className="mt-2 font-serif text-3xl tracking-tight">
                  Services and prices
                </h2>
              </div>
              <p className="max-w-sm text-sm text-ink-3">
                Prices include labour. Parts are extra, and we always ask before replacing anything.
              </p>
            </div>

            <ul className="mt-10 divide-y divide-rule border-y border-rule">
              {services.map((service) => {
                const price =
                  service.kind === 'QUOTE' && !service.priceMinor
                    ? 'By quote'
                    : (formatPrice(service) ?? 'Ask us');
                return (
                  <li key={service.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-3">
                        <h3 className="font-medium">{service.name}</h3>
                        <span
                          aria-hidden
                          className="hidden flex-1 translate-y-[-3px] border-b border-dotted border-rule-strong sm:block"
                        />
                        <span className="tabular shrink-0 font-mono text-sm">{price}</span>
                      </div>
                      <p className="mt-1 max-w-2xl text-sm text-ink-2">
                        {service.description}
                        {service.durationMinutes && (
                          <span className="text-ink-3"> · about {service.durationMinutes} min</span>
                        )}
                        {service.confirmationMode === 'APPROVAL' && (
                          <span className="text-ink-3"> · confirmed by the workshop</span>
                        )}
                      </p>
                    </div>
                    <OpenChatButton
                      className="h-9 justify-self-start rounded-[var(--radius-md)] border border-rule-strong px-3.5 text-sm hover:border-pine-600 hover:bg-pine-50 sm:justify-self-end"
                      input={{ kind: 'choose_service', serviceId: service.id }}
                      label={service.name}
                    >
                      {service.kind === 'QUOTE' ? 'Ask for a quote' : 'Book'}
                      <span className="sr-only"> {service.name}</span>
                    </OpenChatButton>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8" aria-labelledby="how-title">
          <p className="eyebrow">02 · Booking</p>
          <h2 id="how-title" className="mt-2 font-serif text-3xl tracking-tight">
            How booking works
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ['Tell us what you need', 'Write it the way you’d say it — “my brakes feel soft” is enough.'],
              ['Pick a time that suits you', 'You see real free times. Nothing is double-booked.'],
              ['Get a confirmation', 'By email, with a private link to change or cancel.'],
            ].map(([title, text], i) => (
              <li key={title} className="border-t-2 border-ink pt-4">
                <p className="font-mono text-xs text-ink-3">0{i + 1}</p>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-2">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {faqs.length > 0 && (
          <section id="faq" className="border-t border-rule bg-surface" aria-labelledby="faq-title">
            <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_2fr]">
              <div>
                <p className="eyebrow">03 · Questions</p>
                <h2 id="faq-title" className="mt-2 font-serif text-3xl tracking-tight">
                  Things people ask
                </h2>
                <p className="mt-3 text-sm text-ink-2">
                  Not here? Ask in the chat — if the assistant doesn’t know, a person answers.
                </p>
              </div>
              <div className="divide-y divide-rule border-y border-rule">
                {faqs.map((faq) => (
                  <details key={faq.id} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                      {faq.question}
                      <span
                        aria-hidden
                        className="font-mono text-ink-3 transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="hours" className="mx-auto max-w-6xl px-5 py-16 sm:px-8" aria-labelledby="hours-title">
          <p className="eyebrow">04 · Visit</p>
          <h2 id="hours-title" className="mt-2 font-serif text-3xl tracking-tight">
            Opening hours
          </h2>
          <table className="tabular mt-8 w-full max-w-md font-mono text-sm">
            <tbody className="divide-y divide-rule">
              {describeOpeningHours(hours).map((line) => {
                const [days, ...rest] = line.split(' ');
                return (
                  <tr key={line}>
                    <th scope="row" className="py-2.5 text-left font-normal text-ink-2">
                      {days}
                    </th>
                    <td className="py-2.5 text-right">{rest.join(' ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-ink-3 sm:px-8">
          <p>
            © {organization.name}
            {organization.isDemo && ' · fictional business for demonstration'}
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
            <RelayMark className="size-4" />
            Bookings and chat by Relay
          </Link>
        </div>
      </footer>

      <ChatPanel />
    </ChatProvider>
  );
}
