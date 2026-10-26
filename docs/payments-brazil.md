# Brazilian checkout: Mercado Pago

Status: implemented; activation requires the owner's Mercado Pago application, production credentials and a verified webhook.
The existing Stripe checkout remains active until `SEAM_PAYMENT_PROVIDER=mercadopago` is configured. Existing Stripe
webhooks and receipts remain supported after the switch so old refunds can still be reconciled.

## Prices approved October 25, 2026

| Pack | Credits | BRL price | Existing USD reference |
|---|---:|---:|---:|
| Starter | 12 | R$49.90 | $9 |
| Pro | 44 | R$149.90 | $29 |
| Studio | 170 | R$499.90 | $99 |

The owner requested conversion at the current rate and upward rounding to attractive prices. Banco Central's
latest available PTAX sale rate was 5.0377 BRL/USD on October 23 (October 25 was Sunday). Each converted amount
was rounded upward to the next price ending in 9.90. These are fixed prices, not a promise of a live FX conversion.
Preview/final costs remain 2/6 credits. Optional `MP_PRICE_<PACK>_BRL_CENTS` overrides use integer centavos.

Source: [Banco Central PTAX data](https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=%2710-23-2026%27&$format=json).

## Account and application setup

1. Use the owner's existing Brazilian Mercado Pago account, with its actual verified merchant details.
   Onboarding/identity requirements are handled by the provider. The app does not request an SSN, CPF or card number.
2. In Integrations, create **Clipmelt → Checkout Pro → API de Preferences**. Keep the existing Shopify integration intact.
3. Use separate local/staging test credentials and production credentials. Store `MP_ACCESS_TOKEN`,
   `MP_WEBHOOK_SECRET` and `MP_COLLECTOR_ID` privately on Render. Never commit them or put them in `NEXT_PUBLIC_*`.
4. Configure **Payments / payment** Webhooks at `https://clipmelt.com/api/mercadopago/webhook`. Use Webhooks, not unsigned IPN.
   The webhook signing secret is distinct from the access token. The collector id must be the merchant owning that token.
5. Test pending Pix, approved payment, repeat notification and full/partial refund in local/staging first.
6. Set `MP_MODE=production` and `SEAM_PAYMENT_PROVIDER=mercadopago` on Render only when the merchant setup is ready.
   Refresh `/api/auth/me` and `/pricing`: they must show BRL and the approved prices. Test credentials are refused by
   the production checkout; all required private settings must be present before purchase buttons are enabled.
7. Complete an owner-approved real Starter checkout, confirm exactly 12 credits, then refund through Mercado Pago
   and confirm the credits are revoked exactly once. Account setup or mocked tests alone do not prove settlement.

Cloudflare R2 is unrelated to checkout. The owner chose to leave its activation unfinished; no off-site bucket is configured.

## Implementation decision

Use hosted Checkout Pro with the official signature validator from the Mercado Pago Node SDK. This provides Pix/cards
without collecting card or identification fields in Clipmelt. It adds one SDK dependency. Custom card entry and embedded
Checkout Transparente would introduce more client integration work and sensitive-data handling without helping this launch.

The frontend calls `/api/payments/checkout`. Server configuration selects a provider and currency together. A stale client
calling `/api/stripe/checkout` after switching gets a refresh response, rather than silently paying a different currency.
Redirects themselves never grant credits.

Before creating a preference, persist an opaque order id and the exact credit/BRL-price allocation. Only that id goes into
`external_reference`; buyer email, name and identification are not sent by the preference creator. A signed notification
must bind its query and body to the same payment id. Validate HMAC and timestamp freshness, then fetch current payment
state from the fixed Mercado Pago API origin. Verify resource id, collector, live/test mode, currency, amount and local order.

Process the API lookup within an 8-second timeout, below Mercado Pago's documented 22-second acknowledgement window.
Acknowledge only after an atomic SQLite purchase/credit/refund commit. Temporary API or database failures return 503 so
the provider retries. Duplicate deliveries cannot grant or debit twice. Pending payments grant nothing. Refund totals and
chargeback state are monotonic, including out-of-order notifications; refunds after spending may produce a negative balance.
Refund operations are performed in the provider dashboard; the webhook only reconciles receipts and credits.

## Validation and limits

Automated tests cover pending/approved payments, duplicate and out-of-order notifications, full/partial refunds,
chargebacks, wrong amount/currency/collector/mode, signature failures, expired timestamps, ambiguous ids,
API/database failures, immutable sold prices, sandbox refusal in production and untrusted redirect destinations.
Production secrets, real settlement, Pix availability for this merchant, and actual refund delivery require account evidence.

Official references:

- [Checkout Pro overview and payment methods](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview?scope=prod)
- [Preferences API](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/overview)
- [Webhook setup and payment lookup](https://www.mercadopago.com.br/developers/en/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks)
- [Official SDK webhook guidance](https://github.com/mercadopago/sdk-nodejs/blob/master/docs/webhooks.md)
