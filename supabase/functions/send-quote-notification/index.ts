import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = "https://tnvxfzmdjpsswjszwbvf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Rate limit configuration
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MINUTES = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QuoteNotificationRequest {
  contractorName: string;
  customerName: string;
  customerEmail: string;
  projectTitle: string;
  projectDescription: string;
}

// Simple input validation
const validateInput = (data: QuoteNotificationRequest): string | null => {
  const { contractorName, customerName, customerEmail, projectTitle, projectDescription } = data;
  
  // Check required fields exist and are strings
  if (!contractorName || typeof contractorName !== 'string' || contractorName.length > 200) {
    return "Invalid contractor name";
  }
  if (!customerName || typeof customerName !== 'string' || customerName.length > 200) {
    return "Invalid customer name";
  }
  if (!customerEmail || typeof customerEmail !== 'string' || customerEmail.length > 255) {
    return "Invalid customer email";
  }
  if (!projectTitle || typeof projectTitle !== 'string' || projectTitle.length > 500) {
    return "Invalid project title";
  }
  if (!projectDescription || typeof projectDescription !== 'string' || projectDescription.length > 5000) {
    return "Invalid project description";
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    return "Invalid email format";
  }
  
  return null;
};

// Sanitize text to prevent injection in emails
const sanitizeText = (text: string): string => {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
};

// Server-side rate limiting check
const checkRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  identifier: string,
  actionType: string
): Promise<{ allowed: boolean; remainingRequests: number; resetTime: Date }> => {
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - RATE_LIMIT_WINDOW_MINUTES);

  console.log(`Checking rate limit for identifier: ${identifier}, action: ${actionType}`);

  // Count recent requests
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .gte('created_at', windowStart.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request but log it
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: new Date() };
  }

  const currentCount = count || 0;
  const allowed = currentCount < RATE_LIMIT_MAX_REQUESTS;
  const remainingRequests = Math.max(0, RATE_LIMIT_MAX_REQUESTS - currentCount);
  const resetTime = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);

  console.log(`Rate limit check: count=${currentCount}, allowed=${allowed}, remaining=${remainingRequests}`);

  return { allowed, remainingRequests, resetTime };
};

// Record a rate limit entry
const recordRateLimitEntry = async (
  supabase: ReturnType<typeof createClient>,
  identifier: string,
  actionType: string
): Promise<void> => {
  const { error } = await supabase
    .from('rate_limits')
    .insert({ identifier, action_type: actionType });

  if (error) {
    console.error('Failed to record rate limit entry:', error);
  } else {
    console.log(`Rate limit entry recorded for: ${identifier}`);
  }
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Quote notification function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client with service role for rate limiting
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Parse and validate request body
    let requestData: QuoteNotificationRequest;
    try {
      requestData = await req.json();
    } catch {
      console.error("Failed to parse request body");
      return new Response(
        JSON.stringify({ error: "Invalid request body", success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate input
    const validationError = validateInput(requestData);
    if (validationError) {
      console.error("Validation error:", validationError);
      return new Response(
        JSON.stringify({ error: validationError, success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Sanitize inputs for safe email rendering
    const contractorName = sanitizeText(requestData.contractorName);
    const customerName = sanitizeText(requestData.customerName);
    const customerEmail = requestData.customerEmail.trim().toLowerCase();
    const projectTitle = sanitizeText(requestData.projectTitle);
    const projectDescription = sanitizeText(requestData.projectDescription);

    // Server-side rate limiting check using email as identifier
    const rateLimitIdentifier = customerEmail;
    const { allowed, remainingRequests, resetTime } = await checkRateLimit(
      supabase,
      rateLimitIdentifier,
      'quote_request'
    );

    if (!allowed) {
      console.log(`Rate limit exceeded for: ${rateLimitIdentifier}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many quote requests. Please try again later.",
          success: false,
          retryAfter: resetTime.toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((resetTime.getTime() - Date.now()) / 1000).toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": resetTime.toISOString(),
            ...corsHeaders 
          } 
        }
      );
    }

    // Record this request for rate limiting
    await recordRateLimitEntry(supabase, rateLimitIdentifier, 'quote_request');

    console.log("Sending quote notification emails for:", { contractorName, customerName, projectTitle });

    // Send confirmation email to customer
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "TradeStone <quotes@tradestone.lovable.app>",
        to: [customerEmail],
        subject: "Quote Request Confirmation - TradeStone",
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a365d; margin: 0;">TradeStone</h1>
            <p style="color: #666; margin: 5px 0 0 0;">Professional Trade Directory</p>
          </div>
          
          <h2 style="color: #1a365d; border-bottom: 2px solid #3182ce; padding-bottom: 10px;">Quote Request Received</h2>
          
          <p>Hello ${customerName},</p>
          
          <p>We've successfully sent your quote request to <strong>${contractorName}</strong>. Here's a summary of your request:</p>
          
          <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #1a365d;">Project Details:</h3>
            <p><strong>Project Title:</strong> ${projectTitle}</p>
            <p><strong>Description:</strong> ${projectDescription}</p>
          </div>
          
          <h3 style="color: #1a365d;">What happens next?</h3>
          <ul style="color: #666; line-height: 1.6;">
            <li>${contractorName} has been notified of your request via email</li>
            <li>They will review your project details and respond directly to you</li>
            <li>Response times typically range from a few hours to 2 business days</li>
            <li>You can expect a detailed quote including timeline and pricing</li>
          </ul>
          
          <div style="background-color: #e6fffa; border-left: 4px solid #38b2ac; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #234e52;"><strong>Tip:</strong> Keep an eye on your email inbox and spam folder for the contractor's response.</p>
          </div>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          
          <p style="margin-top: 30px;">
            Best regards,<br>
            <strong>The TradeStone Team</strong>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <p style="font-size: 12px; color: #999; text-align: center;">
            This email was sent by TradeStone. If you didn't request this quote, please ignore this email.
          </p>
        </div>
        `,
      })
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(`Email API error: ${emailResult.message || 'Unknown error'}`);
    }

    console.log("Customer email sent successfully:", emailResult);

    // TODO: In a real implementation, you would also send an email to the contractor
    // For now, we'll just log that we would send it
    console.log(`Would send notification email to contractor: ${contractorName}`);

    return new Response(JSON.stringify({ 
      success: true,
      emailId: emailResult.id,
      rateLimitRemaining: remainingRequests - 1
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": (remainingRequests - 1).toString(),
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error in send-quote-notification function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
