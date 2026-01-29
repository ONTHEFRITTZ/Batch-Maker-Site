require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createReviewer() {
  console.log('Creating reviewer account...');
  
  // Create user
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: 'reviewer@batchmaker.app',
    password: 'BatchReview2026!',
    email_confirm: true,
  });

  if (userError) {
    console.error('❌ Error creating user:', userError.message);
    return;
  }

  console.log('✅ User created:', userData.user.id);

  // Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userData.user.id,
      email: 'reviewer@batchmaker.app',
      device_name: 'App Store Reviewer Device',
      role: 'premium',
      subscription_status: 'active',
    });

  if (profileError) {
    console.error('❌ Error creating profile:', profileError.message);
    return;
  }

  console.log('✅ Reviewer account created successfully!');
  console.log('\n📧 Email: reviewer@batchmaker.app');
  console.log('🔑 Password: BatchReview2026!');
  console.log('👑 Role: Premium (full access)');
}

createReviewer();