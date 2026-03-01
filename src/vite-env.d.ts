/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_SUPABASE_CAPTCHA_PROVIDER?: "turnstile" | "hcaptcha";
  readonly VITE_HCAPTCHA_SITE_KEY?: string;
  readonly VITE_CAPTCHA_PROVIDER?: "turnstile" | "hcaptcha";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render: (container: string | HTMLElement, options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }) => string | number;
    reset: (widgetId?: string | number) => void;
  };
  hcaptcha?: {
    render: (container: string | HTMLElement, options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }) => string | number;
    reset: (widgetId?: string | number) => void;
  };
}
