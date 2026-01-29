import Navbar from "../components/Navbar"
import Features from "../components/Features"
import Footer from "../components/Footer"

export default function Home() {
  return (
    <>
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <section className="text-center mb-16">
          <h1 className="text-5xl font-semibold mb-4">
            <span className="bg-gradient-to-br from-bakery-ink to-bakery-muted bg-clip-text text-transparent">
              Batch Maker
            </span>
          </h1>
          <p className="text-xl text-bakery-muted">
            Simple batch planning for makers, kitchens, and small operations.
          </p>
        </section>

        {/* Description */}
        <section className="bg-white border border-gray-200 rounded-2xl p-8 mb-12 shadow-soft">
          <p className="text-lg leading-relaxed">
            Batch Maker helps you organize recipes, plan batches, and keep
            production sane — without bloated features or complexity.
          </p>
        </section>

        {/* Features */}
        <Features />

        {/* Pricing */}
        <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-soft">
          <h2 className="text-2xl font-semibold mb-4">Pricing</h2>

          <p className="mb-6">
            Includes a <strong>30-day free trial</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="relative border-2 border-bakery-ink rounded-xl p-6 text-center">
              <div className="text-sm uppercase tracking-wide text-bakery-muted font-semibold mb-2">
                Monthly
              </div>
              <div className="text-4xl font-bold">
                $5
                <span className="text-base text-bakery-muted">/mo</span>
              </div>
            </div>

            <div className="relative border-2 border-bakery-ink rounded-xl p-6 text-center">
              <div className="text-sm uppercase tracking-wide text-bakery-muted font-semibold mb-2">
                Yearly
              </div>
              <div className="text-4xl font-bold">
                $50
                <span className="text-base text-bakery-muted">/yr</span>
              </div>

              <span className="absolute -top-3 -right-3 bg-bakery-accent text-white text-xs font-semibold px-3 py-1 rounded-full">
                Save 17%
              </span>
            </div>
          </div>

          <p className="text-sm text-bakery-muted italic">
            Subscriptions automatically renew unless canceled at least 24 hours
            before the end of the current period.
          </p>
        </section>

        <Footer />
      </main>
    </>
  )
}
