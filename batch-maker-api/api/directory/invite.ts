import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, getUserFromRequest, checkSubscription } from '../../lib/supabase';
import crypto from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let user: any;

  try {
    user = await getUserFromRequest(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
  }

  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';
    const supabase = createAuthenticatedClient(authToken);

    const hasAccess = await checkSubscription(user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Premium subscription required' });
    }

    const { email, first_name, last_name, job_title, phone, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check for existing invite
    const { data: existing } = await supabase
      .from('invitations')
      .select('id')
      .eq('business_id', user.id)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'An invitation has already been sent to this email' });
    }

    // Get owner's business name
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('device_name, email, business_settings')
      .eq('id', user.id)
      .single();

    const businessName =
      ownerProfile?.business_settings?.business_name ||
      ownerProfile?.device_name ||
      ownerProfile?.email ||
      'Your employer';

    // Generate invite token
    const invite_token = crypto.randomBytes(32).toString('hex');

    // Create invitation row
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert({
        business_id: user.id,
        email: email.toLowerCase(),
        first_name: first_name || null,
        last_name: last_name || null,
        job_title: job_title || null,
        phone: phone || null,
        role: role || 'member',
        invite_token,
        invited_by: user.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Invitation DB error:', inviteError);
      return res.status(500).json({ error: inviteError.message || 'Failed to create invitation' });
    }

    // Get auto-send documents
    const { data: autoSendDocs } = await supabase
      .from('documents')
      .select('name')
      .eq('business_id', user.id)
      .eq('is_auto_send', true);

    // Build invite link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || '';
    const inviteLink = `${appUrl}/accept-invite?token=${invite_token}`;

    // Send email via Resend
    const { error: emailError } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Batch Maker <noreply@batchmaker.app>',
      to: email.toLowerCase(),
      subject: `You've been invited to join ${businessName} on Batch Maker`,
      html: generateInviteEmail({
        firstName: first_name,
        businessName,
        inviteLink,
        appStoreLink: 'https://apps.apple.com/app/batch-maker',
        playStoreLink: 'https://play.google.com/store/apps/details?id=com.batchmaker',
        documents: autoSendDocs || [],
      }),
    });

    if (emailError) {
      // Invitation was created but email failed — still report the error
      console.error('Resend email error:', emailError);
      return res.status(500).json({ 
        error: 'Invitation saved but email failed to send. Check your Resend configuration.',
        details: emailError.message,
      });
    }

    console.log(`Invitation sent to ${email} for business ${businessName}`);

    return res.status(200).json({
      invitation,
      message: `Invitation sent to ${email}`,
    });

  } catch (error: any) {
    console.error('Invite API error:', error);
    return res.status(500).json({ error: error?.message || 'An unexpected error occurred' });
  }
}

function generateInviteEmail(params: {
  firstName?: string;
  businessName: string;
  inviteLink: string;
  appStoreLink: string;
  playStoreLink: string;
  documents: { name: string }[];
}) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1e3a5f; color: white; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 32px 24px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 14px 28px; background: #2563eb; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; }
        .button-green { background: #16a34a; }
        .app-links { text-align: center; margin: 24px 0; }
        .accept-btn { text-align: center; margin: 32px 0; }
        .documents { background: white; padding: 16px; margin: 20px 0; border-left: 4px solid #2563eb; border-radius: 4px; }
        .footer { color: #9ca3af; font-size: 13px; margin-top: 24px; text-align: center; }
        ol { padding-left: 20px; }
        li { margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Batch Maker</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.85;">You've been invited to join a team</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0;">Hi ${params.firstName || 'there'}!</h2>
          <p>You've been invited to join <strong>${params.businessName}</strong> on Batch Maker.</p>
          <p>Batch Maker helps teams manage workflows, track production batches, and stay organised on the floor.</p>

          <h3>Getting started:</h3>
          <ol>
            <li>Download the Batch Maker app</li>
            <li>Create your account using this email address</li>
            <li>Accept your invitation in the app</li>
          </ol>

          <div class="app-links">
            <a href="${params.appStoreLink}" class="button" style="margin-right: 8px;">App Store</a>
            <a href="${params.playStoreLink}" class="button">Google Play</a>
          </div>

          <div class="accept-btn">
            <a href="${params.inviteLink}" class="button button-green">Accept Invitation</a>
          </div>

          ${params.documents.length > 0 ? `
            <div class="documents">
              <h3 style="margin-top: 0;">Required Documents</h3>
              <p>After accepting, please complete the following:</p>
              <ul>
                ${params.documents.map(doc => `<li>${doc.name}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <p class="footer">
            This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}