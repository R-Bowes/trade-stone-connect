import { useEffect, useState } from "react";

export interface CookieConsent {
  marketing: boolean;
  statistics: boolean;
  preferences: boolean;
  /** True once Cookiebot has loaded and the visitor has made a choice. */
  ready: boolean;
}

const NO_CONSENT: CookieConsent = { marketing: false, statistics: false, preferences: false, ready: false };

// Cookiebot's globals are absent when uc.js is blocked (ad blocker, network),
// so every category defaults to "not consented" — consent is never assumed.
function readConsent(): CookieConsent {
  if (typeof window === "undefined") return NO_CONSENT;
  const cookiebot = window.Cookiebot;
  if (!cookiebot) return NO_CONSENT;
  const consent = cookiebot.consent;
  return {
    marketing: consent?.marketing === true,
    statistics: consent?.statistics === true,
    preferences: consent?.preferences === true,
    ready: cookiebot.hasResponse === true,
  };
}

const EVENTS = ["CookiebotOnConsentReady", "CookiebotOnAccept", "CookiebotOnDecline"] as const;

/**
 * Live view of the visitor's Cookiebot consent. Updates without a reload when
 * they accept, decline or withdraw through the banner.
 */
export function useCookieConsent(): CookieConsent {
  const [consent, setConsent] = useState<CookieConsent>(readConsent);

  useEffect(() => {
    const update = () => setConsent(readConsent());
    for (const event of EVENTS) window.addEventListener(event, update);
    // uc.js may have resolved between first render and this effect.
    update();
    return () => {
      for (const event of EVENTS) window.removeEventListener(event, update);
    };
  }, []);

  return consent;
}
