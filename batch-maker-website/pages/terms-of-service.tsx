import Link from 'next/link'

export default function TermsOfService() {
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
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Terms of Service</h1>
        <p className="text-gray-500">Last updated January 2026</p>
      </section>

      {/* Key points */}
      <section className="py-12 px-6 border-b border-gray-100">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { icon: '📋', title: 'Digital SOP Creation', desc: 'Create and manage standard operating procedures digitally.' },
            { icon: '🔄', title: 'Real-time Tracking', desc: 'Track batch progress with real-time updates and notifications.' },
            { icon: '💳', title: 'Flexible Pricing', desc: 'Subscription plans to fit your kitchen\'s needs.' },
          ].map((card) => (
            <div key={card.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">{card.icon}</div>
              <div className="font-semibold text-gray-900 mb-1 text-sm">{card.title}</div>
              <div className="text-gray-500 text-sm">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">

          <div className="bg-[#A8C5B5]/10 border border-[#A8C5B5]/30 rounded-2xl p-6">
            <p className="text-gray-700 leading-relaxed">
              By using Batch Maker, you agree to the following terms. Please read them carefully.
            </p>
          </div>

          {[
            {
              title: 'Use of the Service',
              content: 'Batch Maker is provided to help organize recipes, batches, and production workflows. You agree to use the service responsibly and only for lawful purposes.',
            },
            {
              title: 'Accounts',
              content: 'You are responsible for maintaining the security of your account and for any activity that occurs under it. You must provide accurate information when creating an account.',
            },
            {
              title: 'Subscriptions & Billing',
              content: 'Batch Maker offers a 30-day free trial. After the trial, a paid subscription is required to continue using premium features. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current billing period.',
            },
            {
              title: 'Account Deletion',
              content: 'You may delete your account and all associated data at any time from within your account settings or by contacting support. Account deletion is permanent and cannot be undone.',
            },
            {
              title: 'Availability',
              content: 'We aim to keep Batch Maker available and reliable, but the service is provided "as is" without guarantees of uninterrupted access.',
            },
            {
              title: 'Changes to These Terms',
              content: 'These terms may be updated from time to time. Continued use of the service after changes take effect constitutes acceptance of the updated terms.',
            },
          ].map((section) => (
            <div key={section.title} className="border-b border-gray-100 pb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h2>
              <p className="text-gray-600 leading-relaxed">{section.content}</p>
            </div>
          ))}

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have questions about these terms, contact us at{' '}
              <a href="mailto:batch.maker.app@gmail.com" className="text-[#A8C5B5] hover:text-[#8FB5A0] font-medium">
                batch.maker.app@gmail.com
              </a>.
            </p>
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