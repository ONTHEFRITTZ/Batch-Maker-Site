import { Nav, Footer } from '../components/MarketingLayout'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      <section className="py-16 px-6 text-center bg-gray-50 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
        <p className="text-gray-500">Last updated January 2026</p>
      </section>

      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          <div className="bg-[#A8C5B5]/10 border border-[#A8C5B5]/30 rounded-2xl p-6">
            <p className="text-gray-700 leading-relaxed">
              Batch Maker respects your privacy. This policy explains how we collect, use, and protect your information.
            </p>
          </div>
          {[
            { title: 'Information We Collect', content: 'We collect only the information necessary to provide and improve the service, such as your email address and basic usage data.' },
            { title: 'How We Use Your Information', content: 'Your information is used solely to operate Batch Maker, provide support, and improve the product. We do not sell your data.' },
            { title: 'Data Storage', content: 'Your data is stored securely using industry-standard infrastructure. Reasonable measures are taken to protect it from unauthorized access.' },
            { title: 'Account Deletion', content: 'You may delete your account and all associated data at any time from within your account settings or by contacting support. Account deletion is permanent and cannot be undone.' },
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

      <Footer />
    </div>
  )
}