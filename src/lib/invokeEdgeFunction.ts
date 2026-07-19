import { supabase } from "@/integrations/supabase/client";

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * supabase.functions.invoke() discards the edge function's actual JSON body
 * on any non-2xx response — the thrown FunctionsHttpError's `.message` is
 * hardcoded to "Edge Function returned a non-2xx status code" and `data`
 * comes back null, so a caller doing `data?.error ?? error?.message` never
 * sees the function's real `{error: "..."}` reason. The real body is still
 * readable off the error's `.context`, which is the raw, unread fetch
 * Response the SDK threw with. This reads it and throws the function's own
 * message instead — use this everywhere a money-flow edge function is
 * invoked so a generic SDK string never reaches a user-facing toast.
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options?: InvokeOptions,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, options);

  if (error) {
    const context = (error as { context?: Response }).context;
    let bodyMessage: string | null = null;
    if (context) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === "string") bodyMessage = body.error;
      } catch {
        // Response wasn't JSON, or already consumed — fall back below.
      }
    }
    throw new Error(bodyMessage ?? error.message);
  }

  if (typeof data?.error === "string") {
    throw new Error(data.error);
  }

  return data as T;
}
