import { useState, useEffect } from "react"
import Link from "next/link"
import Head from "next/head"

export default function Dashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/subscriptions/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data)
        setIsLoggedIn(true)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (response.ok && data.access_token) {
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        setUser(data.user)
        setIsLoggedIn(true)
      } else {
        alert(data.error || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('Login failed')
    }
  }

  const handleUpgrade = async () => {
    if (!user) return

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.user_id,
          email: user.email
        })
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#E8E8E8] flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  // Show login form if not logged in
  if (!isLoggedIn) {
    return (
      <>
        <Head>
          <title>Sign In - Batch Maker</title>
        </Head>

        <div className="min-h-screen bg-[#E8E8E8] flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl shadow-lg p-12 w-full max-w-md">
            <div className="text-center mb-8">
              <Link href="/" className="inline-flex items-center gap-2">
                <img src="/assets/icons/logo.png" alt="Batch Maker" className="h-10 w-10" />
                <span className="text-xl font-semibold">Batch Maker</span>
              </Link>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">
              Sign In to Your Account
            </h1>

            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              handleLogin(
                formData.get('email') as string,
                formData.get('password') as string
              )
            }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A8C5B5]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A8C5B5]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white py-3 rounded-lg font-medium"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
                ← Back to home
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Show dashboard
  return (
    <>
      <Head>
        <title>Dashboard - Batch Maker</title>
      </Head>

      <div className="min-h-screen bg-[#E8E8E8]">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img src="/assets/icons/logo.png" alt="Batch Maker" className="h-9 w-9" />
              <span className="text-lg font-semibold">Batch Maker</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/account" className="text-gray-600 hover:text-gray-900">
                Account
              </Link>
              <button
                onClick={() => {
                  localStorage.clear()
                  setIsLoggedIn(false)
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user?.email}</p>
          </div>

          {/* Subscription Status Banner */}
          {user?.subscription_status === 'trial' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Trial Active</h3>
                  <p className="text-blue-800 text-sm">
                    You have {user.days_remaining} days left in your free trial. Upgrade to Team Plan to keep access after trial ends.
                  </p>
                  <button
                    onClick={handleUpgrade}
                    className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-sm text-gray-500 mb-1">Active Workflows</div>
              <div className="text-3xl font-bold text-gray-900">—</div>
              <div className="text-xs text-gray-400 mt-2">Connect your mobile app to see data</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-sm text-gray-500 mb-1">Batches This Week</div>
              <div className="text-3xl font-bold text-gray-900">—</div>
              <div className="text-xs text-gray-400 mt-2">Connect your mobile app to see data</div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-sm text-gray-500 mb-1">Team Members</div>
              <div className="text-3xl font-bold text-gray-900">
                {user?.role === 'premium' ? '1' : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {user?.role === 'premium' ? 'You' : 'Upgrade to add team members'}
              </div>
            </div>
          </div>

          {/* Premium Features */}
          <div className="bg-white rounded-3xl shadow-lg p-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {user?.role === 'premium' ? 'Your Premium Features' : 'Upgrade to Unlock'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#A8C5B5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#A8C5B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Unlimited Workflows</h3>
                  <p className="text-sm text-gray-600">Create unlimited recipes and SOPs</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#A8C5B5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#A8C5B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Team Collaboration</h3>
                  <p className="text-sm text-gray-600">Share workflows with team members</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#A8C5B5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#A8C5B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Cloud Sync</h3>
                  <p className="text-sm text-gray-600">Access data from any device</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-[#A8C5B5]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#A8C5B5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Analytics & Reports</h3>
                  <p className="text-sm text-gray-600">Track productivity and performance</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200">
              {user?.role === 'premium' ? (
                <Link 
                  href="/account"
                  className="inline-flex items-center gap-2 text-[#A8C5B5] hover:text-[#8FB5A0] font-medium"
                >
                  Manage Subscription
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ) : (
                <button
                  onClick={handleUpgrade}
                  className="inline-flex items-center gap-2 bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-6 py-3 rounded-lg font-medium"
                >
                  Upgrade to Team Plan
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}