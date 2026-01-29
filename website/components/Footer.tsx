export default function Footer() {
  return (
    <footer className="mt-16 pt-8 border-t border-gray-200 text-center">
      <div className="flex flex-wrap justify-center items-center gap-3 text-sm text-bakery-muted mb-4">
        <a href="/privacy-policy" className="hover:text-bakery-ink">
          Privacy Policy
        </a>
        <span className="text-gray-300">•</span>
        <a href="/terms-of-service" className="hover:text-bakery-ink">
          Terms of Service
        </a>
        <span className="text-gray-300">•</span>
        <a href="/subscription-policy" className="hover:text-bakery-ink">
          Subscription Policy
        </a>
        <span className="text-gray-300">•</span>
        <a href="/support" className="hover:text-bakery-ink">
          Support
        </a>
      </div>

      <p className="text-xs text-gray-400">
        © 2026 Batch Maker. All rights reserved.
      </p>
    </footer>
  )
}
