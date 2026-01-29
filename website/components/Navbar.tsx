import Link from "next/link"

export default function Navbar() {
  return (
    <header className="w-full">
      <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/assets/icons/logo.png"
            alt="Batch Maker logo"
            className="h-9 w-9"
          />
          <span className="text-lg font-semibold">
            Batch Maker
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-bakery-muted">
          <Link href="/support" className="hover:text-bakery-ink">
            Support
          </Link>
          <Link href="/privacy" className="hover:text-bakery-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-bakery-ink">
            Terms
          </Link>
        </nav>
      </div>
    </header>
  )
}
