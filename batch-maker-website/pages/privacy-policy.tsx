import Link from 'next/link'

export default function PrivacyPolicy() {
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
            <Link href="/subscription-policy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Terms</Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Sign In</Link>
            <Link href="/register" className="text-sm bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 px-6 text-center bg-gray-50 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
        <p className="text-gray-500">Last updated January 2026</p>
      </section>

      {/* Content */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">

          <div className="bg-[#A8C5B5]/10 border border-[#A8C5B5]/30 rounded-2xl p-6">
            <p className="text-gray-700 leading-relaxed">
              Batch Maker respects your privacy. This policy explains how we collect, use, and protect your information.
            </p>
          </div>

          {[
            {
              title: 'Information We Collect',
              content: 'We collect only the information necessary to provide and improve the service, such as your email address and basic usage data.',
            },
            {
              title: 'How We Use Your Information',
              content: 'Your information is used solely to operate Batch Maker, provide support, and improve the product. We do not sell your data.',
            },
            {
              title: 'Data Storage',
              content: 'Your data is stored securely using industry-standard infrastructure. Reasonable measures are taken to protect it from unauthorized access.',
            },
            {
              title: 'Account Deletion',
              content: 'You may delete your account and all associated data at any time from within your account settings or by contacting support. Account deletion is permanent and cannot be undone.',
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
              If you have questions about this policy, please contact us at{' '}
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