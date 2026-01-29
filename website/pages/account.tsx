import Link from "next/link"

export default function Account() {
  return (
    <main className="min-h-screen px-6 py-12 bg-bakery-bg">
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold">Account</h1>
          <p className="text-bakery-muted mt-1">
            Manage your account and data.
          </p>
        </header>

        {/* Account info */}
        <section className="bg-white border border-gray-200 rounded-2xl p-8 mb-8 shadow-soft">
          <h2 className="text-xl font-semibold mb-4">
            Account details
          </h2>

          <p className="text-sm text-bakery-muted">
            Email and subscription settings will appear here once authentication
            is connected.
          </p>
        </section>

        {/* Delete account */}
        <section className="bg-white border border-red-300 rounded-2xl p-8 shadow-soft">
          <h2 className="text-xl font-semibold text-red-700 mb-2">
            Delete account
          </h2>

          <p className="text-sm text-bakery-muted mb-6">
            Deleting your account permanently removes all associated data,
            including recipes, batches, and workflows. This action cannot be
            undone.
          </p>

          <button
            type="button"
            className="bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition"
          >
            Delete my account
          </button>

          <p className="text-xs text-bakery-muted mt-4">
            You can also request account deletion by contacting{" "}
            <a
              href="mailto:batch.maker.app@gmail.com"
              className="underline"
            >
              batch.maker.app@gmail.com
            </a>.
          </p>
        </section>

        <footer className="mt-10 text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to dashboard
          </Link>
        </footer>
      </div>
    </main>
  )
}
