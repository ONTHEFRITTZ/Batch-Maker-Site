import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { getSupabaseClient } from '../../lib/supabase'

const supabase = getSupabaseClient()

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth callback error:', error)
          router.push('/login?error=auth_failed')
          return
        }

        if (!session) {
          router.push('/login')
          return
        }

        // Check if profile already exists
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()

        // New OAuth user — create profile with 30-day trial
        if (!profile) {
          const trialExpiresAt = new Date()
          trialExpiresAt.setDate(trialExpiresAt.getDate() + 30)

          await supabase.from('profiles').insert({
            id: session.user.id,
            device_name: 'Web Browser',
            subscription_status: 'trial',
            trial_started_at: new Date().toISOString(),
            trial_expires_at: trialExpiresAt.toISOString(),
          })
        }

        router.push('/dashboard')
      } catch (err) {
        console.error('Unexpected error:', err)
        router.push('/login')
      }
    }

    handleCallback()
  }, [router])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <p>Signing you in...</p>
    </div>
  )
}