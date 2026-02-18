import Link from 'next/link'
import { useState } from 'react'

export default function Support() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    window.location.href = `mailto:batch.maker.app@gmail.com?subject=Support Request from ${form.name}&body=${encodeURIComponent(form.message)}%0A%0AFrom: ${form.email}`
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <img src="/assets/images/batch-maker-alpha.png" alt="Batch Maker" className="h-10" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/privacy-policy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Privacy</Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Sign In</Link>
            <Link href="/register" className="text-sm bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 px-6 text-center bg-gray-50 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Support</h1>
        <p className="text-gray-500">We're here to help you get the most out of Batch Maker</p>
      </section>

      {/* Support options */}
      <section className="py-12 px-6 border-b border-gray-100">
        <div className="max-w-4xl mx-auto grid md:grid-cols-4 gap-6">
          {[
            { icon: '❓', title: 'FAQ', desc: 'Common questions answered.' },
            { icon: '🎬', title: 'Tutorials', desc: 'Step-by-step video guides.' },
            { icon: '▶️', title: 'Trainings', desc: 'Learn the full platform.' },
            { icon: '✉️', title: 'Contact Us', desc: 'Get direct support.' },
          ].map((item) => (
            <div key={item.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="font-semibold text-gray-900 mb-1 text-sm">{item.title}</div>
              <div className="text-gray-500 text-xs">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact form + info */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-start">

          {/* Form */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a message</h2>
            {submitted ? (
              <div className="bg-[#A8C5B5]/10 border border-[#A8C5B5]/30 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">✓</div>
                <p className="text-gray-700 font-medium">Message sent!</p>
                <p className="text-gray-500 text-sm mt-1">We'll get back to you as soon as possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A8C5B5] transition-all"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A8C5B5] transition-all"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A8C5B5] transition-all resize-none"
                    placeholder="How can we help?"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white py-3 rounded-lg font-medium transition-colors"
                >
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Need help?</h2>
              <p className="text-gray-600 leading-relaxed">
                Email us anytime at{' '}
                <a href="mailto:batch.maker.app@gmail.com" className="text-[#A8C5B5] hover:text-[#8FB5A0] font-medium">
                  batch.maker.app@gmail.com
                </a>
                . We do our best to respond as quickly as possible.
              </p>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <h3 className="font-semibold text-gray-900 mb-2">Feedback & Feature Requests</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Batch Maker is built for real kitchens. If something feels clunky or missing, let us know — your feedback genuinely helps shape the product.
              </p>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <h3 className="font-semibold text-gray-900 mb-2">Account & Billing</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Questions about trials, subscriptions, or billing? Reach out and we'll get you sorted.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-sm text-gray-400">© {new Date().getFullYear()} Batch Maker</span>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/pricing" className="hover:text-gray-700">Pricing</Link>
            <Link href="/privacy-policy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/subscription-policy" className="hover:text-gray-700">Subscription Policy</Link>
            <a href="mailto:batch.maker.app@gmail.com" className="hover:text-gray-700">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  )
}