# Branded auth-email templates

Supabase Auth sends transactional emails (confirm signup, magic link,
password reset, email change, invite) on behalf of your project. The
content is configured in the **Supabase dashboard**, not in this
codebase — Auth emails fly directly from Supabase's SMTP setup, and
the application server never sees them.

This doc carries the canonical Infernet-branded HTML templates.
**Paste each one into the matching Supabase dashboard slot** when
provisioning a new project, or whenever the design changes.

---

## Where to paste

```
Supabase Dashboard
  → Project: <your project>
  → Authentication
  → Email Templates
```

There are five templates. Use the markdown sections below for each.

---

## Brand variables

Substitute these values in each template before pasting:

| Variable             | Value (production)                              |
| -------------------- | ----------------------------------------------- |
| `{{ .SiteURL }}`     | `https://infernetprotocol.com`                  |
| `{{ .ConfirmationURL }}` | (leave as-is — Supabase fills it)           |
| `{{ .Token }}`       | (leave as-is — Supabase fills it)               |
| `{{ .TokenHash }}`   | (leave as-is — Supabase fills it)               |
| `{{ .RedirectTo }}`  | (leave as-is — Supabase fills it)               |

The brand bits (logo, color, footer link) are below.

---

## 1. Confirm signup

**Subject:** `Confirm your Infernet Protocol account`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#06131a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e7f7fb;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#66d9c0;margin:0 0 32px;">
      Infernet Protocol
    </p>
    <h1 style="font-size:28px;font-weight:600;line-height:1.2;color:#ffffff;margin:0 0 16px;">
      Confirm your account
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Click the button below to confirm the email address you used to sign up.
      The link expires in 24 hours.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}"
         style="display:inline-block;background:#14b8a6;color:#06131a;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">
        Confirm email
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      If the button doesn't work, paste this link into your browser:<br>
      <span style="color:#66d9c0;word-break:break-all;">{{ .ConfirmationURL }}</span>
    </p>
    <hr style="border:none;border-top:1px solid rgba(148,199,214,0.16);margin:48px 0 24px;">
    <p style="font-size:12px;line-height:1.6;color:#8fbdc8;margin:0;">
      You're receiving this because you signed up at
      <a href="https://infernetprotocol.com" style="color:#66d9c0;text-decoration:none;">infernetprotocol.com</a>.
      If that wasn't you, ignore this email — no account will be created without confirmation.
    </p>
  </div>
</body>
</html>
```

---

## 2. Magic link

**Subject:** `Sign in to Infernet Protocol`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06131a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e7f7fb;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#66d9c0;margin:0 0 32px;">
      Infernet Protocol
    </p>
    <h1 style="font-size:28px;font-weight:600;line-height:1.2;color:#ffffff;margin:0 0 16px;">
      Your sign-in link
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Click below to sign in. The link is single-use and expires in a few minutes.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}"
         style="display:inline-block;background:#14b8a6;color:#06131a;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">
        Sign in
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Or paste this URL into your browser:<br>
      <span style="color:#66d9c0;word-break:break-all;">{{ .ConfirmationURL }}</span>
    </p>
    <hr style="border:none;border-top:1px solid rgba(148,199,214,0.16);margin:48px 0 24px;">
    <p style="font-size:12px;line-height:1.6;color:#8fbdc8;margin:0;">
      Didn't request this? Someone may have typed your email into the sign-in form.
      You can safely ignore the message — no action will be taken.
    </p>
  </div>
</body>
</html>
```

---

## 3. Reset password

**Subject:** `Reset your Infernet Protocol password`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06131a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e7f7fb;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#66d9c0;margin:0 0 32px;">
      Infernet Protocol
    </p>
    <h1 style="font-size:28px;font-weight:600;line-height:1.2;color:#ffffff;margin:0 0 16px;">
      Reset your password
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Click below to set a new password. The link expires in 1 hour.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}"
         style="display:inline-block;background:#14b8a6;color:#06131a;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">
        Reset password
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Or paste:<br>
      <span style="color:#66d9c0;word-break:break-all;">{{ .ConfirmationURL }}</span>
    </p>
    <hr style="border:none;border-top:1px solid rgba(148,199,214,0.16);margin:48px 0 24px;">
    <p style="font-size:12px;line-height:1.6;color:#8fbdc8;margin:0;">
      Didn't request a reset? Ignore this email — your current password stays in effect.
      If you keep getting these messages, someone may be trying to access your account;
      consider changing it from a known device.
    </p>
  </div>
</body>
</html>
```

---

## 4. Change email confirmation

**Subject:** `Confirm your new email on Infernet Protocol`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06131a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e7f7fb;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#66d9c0;margin:0 0 32px;">
      Infernet Protocol
    </p>
    <h1 style="font-size:28px;font-weight:600;line-height:1.2;color:#ffffff;margin:0 0 16px;">
      Confirm your new email address
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      Click below to finish updating the email on your account.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}"
         style="display:inline-block;background:#14b8a6;color:#06131a;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">
        Confirm new email
      </a>
    </p>
    <hr style="border:none;border-top:1px solid rgba(148,199,214,0.16);margin:48px 0 24px;">
    <p style="font-size:12px;line-height:1.6;color:#8fbdc8;margin:0;">
      If you didn't request this change, sign in and review your account
      security — someone may be tampering.
    </p>
  </div>
</body>
</html>
```

---

## 5. Invite user

**Subject:** `You've been invited to Infernet Protocol`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06131a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e7f7fb;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#66d9c0;margin:0 0 32px;">
      Infernet Protocol
    </p>
    <h1 style="font-size:28px;font-weight:600;line-height:1.2;color:#ffffff;margin:0 0 16px;">
      You're invited
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#8fbdc8;margin:0 0 32px;">
      An admin invited you to Infernet Protocol — a peer-to-peer GPU
      inference marketplace. Click below to accept and set a password.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}"
         style="display:inline-block;background:#14b8a6;color:#06131a;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">
        Accept invitation
      </a>
    </p>
    <hr style="border:none;border-top:1px solid rgba(148,199,214,0.16);margin:48px 0 24px;">
    <p style="font-size:12px;line-height:1.6;color:#8fbdc8;margin:0;">
      Don't recognize the sender? Ignore this email — no account is created
      until you accept.
    </p>
  </div>
</body>
</html>
```

---

## SMTP configuration

Already done on the user's project. For reference, Supabase Auth uses
the SMTP configured at:

```
Project → Authentication → SMTP Settings
```

If you ever rotate SMTP credentials, the templates above don't change —
only the underlying delivery mechanism does.

---

## When to update this file

- A brand element changes (logo URL, color, name, tagline).
- A new email type is added (Supabase has historically added 1–2 per year).
- A subject line copy change.

The HTML files are the source-of-truth in the repo so reviewers can
see what end-users get. The Supabase dashboard is the live edit
surface — keep them in sync.
