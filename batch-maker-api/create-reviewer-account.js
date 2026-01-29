// Script to create reviewer account
// Run with: node create-reviewer-account.js

const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseServiceKey = 'YOUR_SUPABASE_SERVICE_KEY';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createReviewerAccount() {
  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'reviewer@batchmaker.app',
      password: 'BatchReview2026!',
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth error:', authError);
      return;
    }

    console.log('✅ User created:', authData.user.id);

    // Create profile with premium access
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: 'reviewer@batchmaker.app',
        device_name: 'App Store Reviewer Device',
        role: 'premium',
        subscription_status: 'active',
      });

    if (profileError) {
      console.error('Profile error:', profileError);
      return;
    }

    console.log('✅ Profile created with premium access');
    console.log('\nReviewer Account Details:');
    console.log('Email: reviewer@batchmaker.app');
    console.log('Password: BatchReview2026!');
    console.log('Role: Premium (full access)');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createReviewerAccount();