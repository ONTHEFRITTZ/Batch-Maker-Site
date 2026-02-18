import { Nav, Footer } from '../components/MarketingLayout'

export default function SubscriptionPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      <section className="py-16 px-6 text-center bg-gray-50 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Subscription Policy</h1>
        <p className="text-gray-500">Last updated January 2026</p>
      </section>

      <section className="py-12 px-6 border-b border-gray-100">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { icon: '🆓', title: '30-Day Free Trial', desc: 'Full access, no credit card required to start.' },
            { icon: '💳', title: '$25 / month', desc: 'Simple flat-rate pricing after your trial ends.' },
            { icon: '🔄', title: 'Cancel Anytime', desc: 'No contracts. Manage via App Store or Google Play.' },
          ].map((card) => (
            <div key={card.title} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">{card.icon}</div>
              <div className="font-semibold text-gray-900 mb-1 text-sm">{card.title}</div>
              <div className="text-gray-500 text-sm">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          {[
            { title: 'Pricing', content: null, list: ['30-day free trial', '$25 USD per month after trial'] },
            { title: 'Auto-Renewal', content: 'Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period.' },
            { title: 'Management', content: "Billing and cancellations are handled by Apple App Store or Google Play. Manage your subscription in your account settings or through your device's subscription management system." },
            { title: 'Free Trial', content: "Your free trial is for 30 days. You can cancel at any time during the trial period without being charged. If you don't cancel, your subscription will automatically begin at the end of the trial period." },
            { title: 'Cancellation', content: "You can cancel your subscription at any time. When you cancel, you'll continue to have access until the end of your current billing period. No refunds are provided for partial periods." },
          ].map((section) => (
            <div key={section.title} className="border-b border-gray-100 pb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h2>
              {section.content && <p className="text-gray-600 leading-relaxed">{section.content}</p>}
              {section.list && (
                <ul className="space-y-2">
                  {section.list.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-gray-600">
                      <span className="text-[#A8C5B5] font-bold">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              Questions about your subscription? Contact us at{' '}
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