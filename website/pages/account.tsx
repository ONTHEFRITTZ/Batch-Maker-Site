import { useState, useEffect } from "react"
import Link from "next/link"
import Head from "next/head"

export default function Account() {
  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAccountData()
  }, [])

  const loadAccountData = async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        window.location.href = '/dashboard'
        return
      }

      // Get subscription status
      const response = await fetch('/api/subscriptions/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data)
        setSubscription(data)
      }
    } catch (error) {
      console.error('Error loading account:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Unable to open billing portal')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to open subscription portal')
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure? This will permanently delete all your data. This cannot be undone.')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        localStorage.clear()
        alert('Account deleted successfully')
        window.location.href = '/'
      } else {
        alert('Failed to delete account')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to delete account')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#E8E8E8] flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Account Settings - Batch Maker</title>
      </Head>

      <div className="min-h-screen bg-[#E8E8E8]">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img src="/assets/icons/logo.png" alt="Batch Maker" className="h-9 w-9" />
              <span className="text-lg font-semibold">Batch Maker</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <button
                onClick={() => {
                  localStorage.clear()
                  window.location.href = '/'
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Account Settings</h1>
            <p className="text-gray-600">Manage your subscription and account preferences</p>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-3xl shadow-lg p-8 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Account Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Email</label>
                <div className="text-gray-900">{user?.email || 'Not available'}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Device</label>
                <div className="text-gray-900">{user?.device_name || 'Unknown Device'}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Member Since</label>
                <div className="text-gray-900">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Info */}
          <div className="bg-white rounded-3xl shadow-lg p-8 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Subscription</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Status</label>
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    subscription?.subscription_status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : subscription?.subscription_status === 'trial'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {subscription?.subscription_status?.toUpperCase() || 'FREE'}
                  </span>
                </div>
              </div>

              {subscription?.days_remaining && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Time Remaining</label>
                  <div className="text-gray-900">{subscription.days_remaining} days</div>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Plan</label>
                <div className="text-gray-900">
                  {subscription?.role === 'premium' ? 'Team Plan' : 'Free Plan'}
                </div>
              </div>
            </div>

            {subscription?.role === 'premium' && (
              <button
                onClick={handleManageSubscription}
                className="bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Manage Subscription
              </button>
            )}

            {subscription?.role !== 'premium' && (
              <Link
                href="/#pricing"
                className="inline-block bg-[#A8C5B5] hover:bg-[#8FB5A0] text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Upgrade to Team Plan
              </Link>
            )}
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-3xl shadow-lg p-8 border-2 border-red-200">
            <h2 className="text-xl font-bold text-red-600 mb-4">Danger Zone</h2>
            
            <p className="text-gray-600 mb-6">
              Once you delete your account, there is no going back. All your workflows, batches, and data will be permanently deleted.
            </p>

            <button
              onClick={handleDeleteAccount}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Delete Account
            </button>
          </div>

          <div className="mt-8">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ← Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}