# Re-branding AutoPoint for another business

Most of it needs no code: a new studio is configured from the admin panel.

## From the admin panel (no code)

| What | Where |
|---|---|
| Name, phone, WhatsApp, Telegram, email, Instagram | Настройки сайта → Контакты и адрес |
| Address, city, map coordinates | Настройки сайта → Контакты и адрес |
| Logo, accent colour | Настройки сайта → Бренд и SEO |
| SEO title and description (3 languages) | Настройки сайта → Бренд и SEO |
| Booking rules: slot step, buffer, lead time, horizon, cancel cutoff | Настройки сайта → Правила онлайн-записи |
| Opening hours, holidays | Часы и праздники |
| Services, options, vehicle-class prices, durations | Услуги и цены |
| Discounts | Скидки |
| Team, photos, schedules, skills | Сотрудники |
| Gallery, reviews | Галерея, Отзывы |
| "Demo site" notice | Настройки сайта → Демо-режим (untick when the data is real) |

## In code

- **Texts** (headings, buttons, page copy) live in `apps/web/messages/{ru,kk,en}.json`.
  - A test checks that all three languages have the same keys and valid ICU syntax.
  - The admin texts (`Admin`) exist in Russian only.
- **Languages:**
  - `apps/web/src/i18n/routing.ts` lists the locales, and Russian is the default, without a
    URL prefix;
  - to drop a language, remove it there and in `messages/`;
  - the API keeps translated fields as `{"ru": …, "kk": …, "en": …}`.
- **Colours and fonts:**
  - the colour tokens are at the top of `apps/web/src/app/globals.css` (`--color-bg`,
    `--color-accent`, …), and the admin accent colour overrides `--color-accent`;
  - fonts are set in `apps/web/src/app/[locale]/layout.tsx`. Keep the Kazakh letters in mind
    (Ә Ғ Қ Ң Ө Ұ Ү Һ І).
- **Home page sections:** `apps/web/src/app/[locale]/page.tsx`.
- **Vehicle classes** (compact … large SUV) and the demo catalogue are in
  `apps/api/app/seed.py`. The seed runs only on an empty database (`SEED_DEMO=true` in
  production). For a new client either start without it and fill the catalogue in the
  admin, or edit the seed first.
- **Time zone and currency:**
  - the time zone is `timezone` in the site settings record (default `Asia/Almaty`, UTC+5,
    in `apps/api/app/modules/site/models.py`); it is not editable in the admin;
  - prices are whole tenge (KZT), and another currency means changing the formatting in
    `apps/web/src/lib/format.ts`.

## Things to keep honest

- **Reviews:** never import or write reviews that were not given by real customers. Each
  review records its source (Google, 2ГИС, Яндекс or in person), ideally with a link.
- **Demo data:** the seed's contacts, team and gallery are examples (`is_demo`). Replace or
  delete them before the site goes public, then switch off the demo mode.
- **Privacy:** `apps/web/messages/*.json` → `Privacy` is a template. Have a lawyer adapt it
  to the business (the Law of RK on personal data).
