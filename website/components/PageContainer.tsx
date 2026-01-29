import Navbar from "./Navbar"
import Footer from "./Footer"

export default function PageContainer({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold mb-10 text-center">
          {title}
        </h1>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-soft prose prose-neutral max-w-none">
          {children}
        </div>

        <Footer />
      </main>
    </>
  )
}
