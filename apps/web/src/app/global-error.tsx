"use client";

import messages from "../../messages/ru.json";

// Last-resort page when the root layout itself fails (e.g. the API is down on first render).
// No i18n context exists here, so it uses the default-locale (ru) messages directly.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = messages.Error;
  return (
    <html lang="ru">
      <body style={{ background: "#0d0d0e", color: "#f3efe8", fontFamily: "system-ui, sans-serif", padding: "4rem 1rem" }}>
        <h1 style={{ fontSize: "2rem" }}>{t.title}</h1>
        <p style={{ color: "#a7a198", maxWidth: "36rem" }}>{t.lead}</p>
        <button type="button" onClick={reset} style={{ marginTop: "2rem", minHeight: 48, padding: "0 1.5rem", background: "#c3a46c", color: "#0d0d0e", border: 0 }}>
          {t.retry}
        </button>
      </body>
    </html>
  );
}
