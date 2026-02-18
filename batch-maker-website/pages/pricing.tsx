import Link from 'next/link'

export default function Pricing() {
  const features = [
    {
      icon: '📋',
      title: 'Workflow Management',
      items: [
        'Custom workflow builder with step-by-step instructions',
        'AI recipe parser — import from text or URL',
        'Batch scaling (0.5x, 1x, 2x, 3x, or custom)',
        'Ingredient checklists per step',
        'YouTube video references for training',
      ],
    },
    {
      icon: '⏱️',
      title: 'Batch Tracking & Timers',
      items: [
        'Bake Today 🟢 and Cold Ferment 🔵 modes',
        'Multiple active timers across batches',
        'Urgent timer alerts with visual flashing',
        'Background timer persistence',
        'Batch duplication and custom naming',
      ],
    },
    {
      icon: '👥',
      title: 'Team Coordination',
      items: [
        'Station-based batch claiming',
        'Real-time sync across all devices',
        'Custom station names per device',
        'My Workflows view for personal batches',
        'Multi-tablet / multi-phone support',
      ],
    },
    {
      icon: '📥',
      title: 'Import & Data',
      items: [
        'URL import from most recipe websites',
        'Paste-text AI parsing',
        'Excel / spreadsheet bulk import',
        'Cloud sync via Supabase',
        'Offline-capable with local cache',
      ],
    },
  ]

  const included = [
    '30-day free trial',
    'Unlimited workflows & batches',
    'AI recipe parsing',
    'Real-time team sync',
    'Multi-device support',
    'Inventory management',
    'Production scheduling & calendar',
    'Analytics dashboard',
    'Multi-location support',
    'Cancel anytime',
  ]

  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <img src="/assets/images/batch-maker-alpha.png" alt="Batch Maker" className="h-10" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/support" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Support</Link>
            <Link href="/privacy-policy" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Terms</Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Sign In</Link>
            <Link href="/register" className="text-sm bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 px-6 text-center bg-gray-50 border-b border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h1>
        <p className="text-gray-500 text-lg">30-day free trial · Cancel anytime · No hidden fees</p>
      </section>

      {/* Pricing + Features */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-start">

            {/* Price box */}
            <div className="bg-white border-2 border-[#A8C5B5] rounded-2xl p-8 shadow-lg">
              <div className="inline-block bg-[#A8C5B5]/20 text-[#5a8a74] text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
                Premium
              </div>
              <div className="mb-2">
                <span className="text-6xl font-bold text-gray-900">$25</span>
                <span className="text-gray-500 text-lg">/month</span>
              </div>
              <p className="text-gray-500 text-sm mb-8">after your 30-day free trial</p>

              <ul className="space-y-3 mb-8">
                {included.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-700 text-sm">
                    <span className="text-[#A8C5B5] font-bold text-base">✓</span>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className="block w-full bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white py-3 rounded-xl font-semibold transition-colors text-base text-center"
              >
                Start Free Trial
              </Link>

              <p className="text-xs text-gray-400 text-center mt-4">
                Managed via Apple App Store or Google Play
              </p>
            </div>

            {/* Feature highlights */}
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Everything included</h2>
              {features.map((group) => (
                <div key={group.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{group.icon}</span>
                    <h3 className="font-semibold text-gray-800 text-sm">{group.title}</h3>
                  </div>
                  <ul className="space-y-1 pl-8">
                    {group.items.map((item) => (
                      <li key={item} className="text-sm text-gray-500 flex items-start gap-2">
                        <span className="text-gray-300 mt-0.5">–</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Reassurance strip */}
      <section className="py-12 px-6 bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-8 text-center">
          {[
            { icon: '🔓', title: 'Free for 30 days', desc: 'Full access during your trial. No credit card needed to start.' },
            { icon: '📱', title: 'iOS & Android', desc: 'Native apps for phones and tablets. Works great on kitchen iPads.' },
            { icon: '🔄', title: 'Cancel anytime', desc: 'No contracts. Cancel from your App Store or Google Play settings.' },
          ].map((item) => (
            <div key={item.title}>
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="font-semibold text-gray-900 mb-1 text-sm">{item.title}</div>
              <div className="text-gray-500 text-xs leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-sm text-gray-400">© {new Date().getFullYear()} Batch Maker</span>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <Link href="/support" className="hover:text-gray-700 transition-colors">Support</Link>
            <Link href="/privacy-policy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
            <Link href="/subscription-policy" className="hover:text-gray-700 transition-colors">Subscription Policy</Link>
            <Link href="/terms-of-service" className="hover:text-gray-700 transition-colors">Terms of Service</Link>
            <a href="mailto:batch.maker.app@gmail.com" className="hover:text-gray-700 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  )
}