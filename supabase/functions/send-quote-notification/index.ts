import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

const handler = async (req: Request): Promise<Response> => {
  console.log("Quote notification function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contractorName, customerName, customerEmail, projectTitle, projectDescription }: QuoteNotificationRequest = await req.json();

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
      emailId: emailResult.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
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