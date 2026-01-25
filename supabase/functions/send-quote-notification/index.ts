import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = "https://tnvxfzmdjpsswjszwbvf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Rate limit configuration
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MINUTES = 5;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tradestone.lovable.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

const allowedOrigins = (() => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (!envOrigins) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return envOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
})();

const resolveCorsOrigin = (origin: string | null): string | null => {
  if (!origin) {
    return null;
  }
  if (allowedOrigins.includes(origin)) {
    return origin;
  }
  return null;
};

const buildCorsHeaders = (origin: string | null): HeadersInit => {
  const allowedOrigin = resolveCorsOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowedOrigin ?? "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

interface QuoteSubmissionRequest {
  contractor_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  project_title: string;
  project_description: string;
  project_location?: string | null;
  budget_range?: string | null;
  timeline?: string | null;
  additional_details?: Record<string, string> | null;
  contractorName: string;
}

// Input validation
const validateInput = (data: QuoteSubmissionRequest): string | null => {
  const { contractor_id, customer_name, customer_email, project_title, project_description, contractorName } = data;
  
  // Check required fields exist and are strings
  if (!contractor_id || typeof contractor_id !== 'string' || contractor_id.length > 100) {
    return "Invalid contractor ID";
  }
  if (!customer_name || typeof customer_name !== 'string' || customer_name.length > 200) {
    return "Invalid customer name";
  }
  if (!customer_email || typeof customer_email !== 'string' || customer_email.length > 255) {
    return "Invalid customer email";
  }
  if (!project_title || typeof project_title !== 'string' || project_title.length > 500) {
    return "Invalid project title";
  }
  if (!project_description || typeof project_description !== 'string' || project_description.length > 5000) {
    return "Invalid project description";
  }
  if (!contractorName || typeof contractorName !== 'string' || contractorName.length > 200) {
    return "Invalid contractor name";
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customer_email)) {
    return "Invalid email format";
  }
  
  // UUID validation for contractor_id
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(contractor_id)) {
    return "Invalid contractor ID format";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any>>;

// Server-side rate limiting check
const checkRateLimit = async (
  supabase: SupabaseClientAny,
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
  supabase: SupabaseClientAny,
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
  console.log("Quote submission function called");
  
  // Handle CORS preflight requests
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!resolveCorsOrigin(origin)) {
    return new Response(
      JSON.stringify({ error: "Origin not allowed", success: false }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Initialize Supabase client with service role for database operations
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Parse and validate request body
    let requestData: QuoteSubmissionRequest;
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

    // Sanitize inputs
    const customerEmail = requestData.customer_email.trim().toLowerCase();
    const customerName = sanitizeText(requestData.customer_name);
    const contractorName = sanitizeText(requestData.contractorName);
    const projectTitle = sanitizeText(requestData.project_title);
    const projectDescription = sanitizeText(requestData.project_description);

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

    // Insert quote into database using service role
    console.log("Inserting quote into database");
    const { data: quoteData, error: insertError } = await supabase
      .from('quotes')
      .insert({
        contractor_id: requestData.contractor_id,
        customer_name: requestData.customer_name.trim(),
        customer_email: customerEmail,
        customer_phone: requestData.customer_phone?.trim() || null,
        project_title: requestData.project_title.trim(),
        project_description: requestData.project_description.trim(),
        project_location: requestData.project_location?.trim() || null,
        budget_range: requestData.budget_range || null,
        timeline: requestData.timeline || null,
        additional_details: requestData.additional_details || null,
        status: 'pending'
      })
      .select('id')
      .single();

    if (insertError) {
      console.error("Failed to insert quote:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit quote request", success: false }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Quote inserted successfully:", quoteData?.id);

    // Send confirmation email to customer
    console.log("Sending confirmation email to:", customerEmail);
    
    try {
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
        console.error("Email API error:", emailResult);
        // Don't fail the request if email fails - quote was already saved
      } else {
        console.log("Customer email sent successfully:", emailResult.id);
      }
    } catch (emailError) {
      console.error("Error sending email:", emailError);
      // Don't fail - quote was already saved
    }

    return new Response(JSON.stringify({ 
      success: true,
      quoteId: quoteData?.id,
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
    console.error("Error in quote submission function:", error);
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
