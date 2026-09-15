import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <RelayWordmark />
      <p className="mt-10">
        <Link href="/login" className="text-pine-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
