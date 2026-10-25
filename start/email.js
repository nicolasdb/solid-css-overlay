// Runs before the server, on every start (start/start.sh): writes CSS's email
// sender from the instance's environment, so "Forgot your password?" can send
// its link. Stock CSS ships two choices, both as files to import:
//   config/identity/email/default.json  no sender: forgot-password answers
//                                       "No email server is configured."
//   config/identity/email/example.json  nodemailer over SMTP, credentials
//                                       written in the JSON itself
// Until 7.2.0-9 the image imported default.json, so nobody could reset a
// password (Maps of Making #15). An instance cannot edit the config (its
// checkout is never edited, CLAUDE.md) and its password does not belong in a
// repo, so the configs import this file instead, written here at start:
// the stock example's sender when SMTP_HOST is set, a copy of default.json
// when it is not.
//
// The values come from instance-template/email.env (git-ignored, optional).
// Only SMTP with STARTTLS (port 587 or 2587): stock BaseEmailSender passes
// host, port and auth to nodemailer and nothing else, so `secure` (port 465)
// cannot be set from the config (CSS 7.2 and the 8.x docs alike).
const fs = require("fs");

const out = "config/identity/email/overlay.json";
const env = process.env;
const context = "https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^7.0.0/components/context.jsonld";

let sender;
if (env.SMTP_HOST) {
  const missing = ["SMTP_USER", "SMTP_PASS", "EMAIL_FROM"].filter((name) => !env[name]);
  const port = Number(env.SMTP_PORT || 587);
  if (missing.length || !Number.isInteger(port)) {
    // Fail the start rather than run without mail: a server that starts with
    // a broken sender looks fine until someone is locked out of their pod.
    console.error(
      `[solid-css-overlay] SMTP_HOST is set but ${missing.length ? missing.join(", ") + " missing" : "SMTP_PORT is not a number"}: ` +
        "fill email.env, or empty SMTP_HOST to run without mail"
    );
    process.exit(1);
  }
  sender = {
    "@id": "urn:solid-server:default:EmailSender",
    "@type": "BaseEmailSender",
    args_senderName: env.EMAIL_FROM,
    args_emailConfig_host: env.SMTP_HOST,
    args_emailConfig_port: port,
    args_emailConfig_auth_user: env.SMTP_USER,
    args_emailConfig_auth_pass: env.SMTP_PASS,
  };
} else {
  sender = {
    "@id": "urn:solid-server:default:EmailSender",
    "@type": "UnsupportedAsyncHandler",
    errorMessage: "No email server is configured.",
  };
}

// The password is in this file: readable by the server's user only. It lives
// in the container's own filesystem, never in the data volume.
fs.writeFileSync(out, JSON.stringify({ "@context": context, "@graph": [sender] }, null, 2) + "\n", { mode: 0o600 });
console.log(
  env.SMTP_HOST
    ? `[solid-css-overlay] email: ${env.SMTP_HOST}:${sender.args_emailConfig_port} as ${env.EMAIL_FROM}`
    : "[solid-css-overlay] email: none (SMTP_HOST unset), forgot-password cannot send"
);
