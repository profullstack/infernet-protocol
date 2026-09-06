import "server-only";
import { createFormGuard } from "@profullstack/form-guard";

/**
 * Shared guard for the public contact form.
 *
 * Both the page that renders the form and the route that receives it
 * import this, so the token binding and the field names cannot drift
 * apart — a mismatch there would reject every real submission silently.
 *
 * The secret never reaches the browser; only the signature does. It does
 * have to be identical across every instance serving the form, so it
 * falls back to RESEND_API_KEY, which this route already cannot work
 * without and which is by definition the same everywhere.
 */
const secret = process.env.FORM_GUARD_SECRET ?? process.env.RESEND_API_KEY ?? "";

export const contactGuard = secret
    ? createFormGuard({
          secret,
          binding: "infernet:contact",
          brandTerms: ["infernet protocol", "infernetprotocol"],
          rateLimit: { max: 5, windowMs: 60 * 60 * 1000 },
          // Enforcement is on by default. Set FORM_GUARD_ENFORCE=0 to fall
          // back to scoring only, if a real sender ever reports being
          // turned away.
          requireToken: process.env.FORM_GUARD_ENFORCE !== "0"
      })
    : null;
