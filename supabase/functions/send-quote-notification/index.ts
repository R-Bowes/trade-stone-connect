// ─────────────────────────────────────────────────────────────────────────────
// REPLACEMENT for the customer confirmation email section inside
// supabase/functions/send-quote-notification/index.ts
//
// ADD this import at the top alongside the other imports:
//   import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";
//
// FIND this block (around line 195):
//   // Send confirmation email to customer
//   console.log("Sending confirmation email to:", customerEmail);
//   try {
//     const emailResponse = await fetch('https://api.resend.com/emails', {
//       ...
//     body: JSON.stringify({
//       from: "TradeStone <noreply@tradesltd.co.uk>",
//       ...
//       html: `<div style="font-family: Arial ...
//     })
//   ...
//   }
//
// REPLACE the entire try block with:
// ─────────────────────────────────────────────────────────────────────────────

    // Send confirmation email to customer
    console.log("Sending confirmation email to:", customerEmail);
    try {
      const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";

      const emailData = {
        customerName:       customerName,
        contractorName:     contractorName,
        projectTitle:       projectTitle,
        projectDescription: projectDescription,
        ctaUrl:             `${publicUrl}/enquiries`,
      };

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "TradeStone <noreply@tradesltd.co.uk>",
          to: [customerEmail],
          subject: buildSubject("quote_request_confirmation", emailData),
          html: buildEmail("quote_request_confirmation", emailData),
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error("Email API error:", emailResult);
        // Don't fail the request if email fails — enquiry was already saved
      } else {
        console.log("Customer confirmation email sent successfully:", emailResult.id);
      }
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Don't fail — enquiry was already saved
    }
