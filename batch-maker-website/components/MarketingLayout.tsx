import Link from 'next/link'

export function Nav() {
  return (
    <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <img src="/assets/images/batch-maker-alpha.png" alt="Batch Maker" className="h-10" />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
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
  )
}

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <img src="/assets/images/batch-maker-alpha.png" alt="Batch Maker" className="h-8" />
          <span className="text-sm text-gray-400">© {new Date().getFullYear()} Batch Maker</span>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
          <Link href="/pricing" className="hover:text-gray-700 transition-colors">Pricing</Link>
          <Link href="/support" className="hover:text-gray-700 transition-colors">Support</Link>
          <Link href="/privacy-policy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
          <Link href="/subscription-policy" className="hover:text-gray-700 transition-colors">Subscription Policy</Link>
          <Link href="/terms-of-service" className="hover:text-gray-700 transition-colors">Terms of Service</Link>
          <a href="mailto:batch.maker.app@gmail.com" className="hover:text-gray-700 transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  )
}