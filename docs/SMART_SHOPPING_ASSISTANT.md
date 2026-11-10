# AVELORA Smart Shopping Assistant

## What it does
- Persian guided shopping conversation, using the live public product catalog.
- Product matching by product name, description, category, availability and a parsed budget.
- Curated prompts for bags, beauty products, gifts and shipping questions.
- Side-by-side comparison of up to three selected catalog products (name, recorded price, stock and category).
- Store-settings-backed answers for shipping, payment and returns; contact links are shown only when configured.
- Order tracking is routed to the authenticated customer account area; the assistant never exposes order records itself.
- Responsive, keyboard-accessible chat panel with no persistent chat transcript.

## Data and safety boundaries
- No paid AI API, API key, or external model call is used. Matching is deterministic and catalog-grounded; it must not be marketed as a generative LLM.
- The assistant does not invent color, material, size, ingredients, suitability, delivery estimates, discounts or policies.
- Product price and stock are read from the public catalog endpoint. Checkout, payment, inventory mutation, refunds and order status changes remain outside the assistant.
- Contact links are rendered only from configured public store settings.
- If product/catalog fields are missing, the assistant says so rather than guessing.

## Verification
Run `npm run check` from `backend/`. Then verify in a browser on desktop and mobile:
1. Open the assistant and ask for a bag or a beauty product.
2. Ask for a product below a budget (e.g. «کیف تا ۲ میلیون تومان»).
3. Compare two products and confirm only catalog fields are shown.
4. Ask about shipping, payment and returns with both configured and empty settings.
5. Confirm account/order questions lead to the account area without disclosing order data.
6. Test with an empty catalog and with the API unavailable.
