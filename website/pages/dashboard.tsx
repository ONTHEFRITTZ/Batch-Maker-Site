import Link from "next/link"

export default function Dashboard() {
  return (
    <main className="min-h-screen px-6 py-12 bg-bakery-bg">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-semibold">Dashboard</h1>

          <nav className="flex gap-4 text-sm">
            <Link href="/account" className="underline">
              Account
            </Link>
            <Link href="/" className="underline">
              Home
            </Link>
          </nav>
        </header>

        <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-soft">
          <h2 className="text-xl font-semibold mb-2">
            Welcome to Batch Maker
          </h2>

          <p className="text-bakery-muted">
            This is where you’ll manage recipes, batches, and production
            workflows. We’re keeping things simple and practical — just like a
            real kitchen.
          </p>
        </section>
      </div>
    </main>
  )
}
