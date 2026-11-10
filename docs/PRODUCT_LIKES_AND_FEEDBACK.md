# AVELORA product likes and customer feedback

Migration: `database/migrations/010_product_likes_customer_feedback.sql`

## Product likes
- Likes are stored in PostgreSQL and displayed from the real database count.
- Signed-in customers are keyed by customer account; guests receive a random browser token held locally and sent as `X-Avelora-Visitor`.
- A visitor can toggle their own like. The database unique key prevents duplicate likes for the same product and voter.
- Guest tokens are pseudonymous browser identifiers, not proof of a unique human. Clearing browser storage or changing devices can create another voter identity; do not treat likes as audited votes.

## Customer feedback
- Customers can submit a comment or suggestion from the bottom of the storefront.
- New submissions are private (`pending`) until a store owner reviews and approves them.
- Only approved feedback is shown publicly. Rejected and pending feedback are never displayed on the storefront.
- The admin moderation screen is owner-only.

## Authenticity
Do not seed sample likes, fabricated customer names, or invented testimonials. The UI starts at zero and only shows database-backed activity. If the store needs launch content, invite real customers to share honest feedback and label any incentives clearly.

## Deployment
Back up the database first. Apply migration 010 once, deploy the matching backend and frontend files together, then verify like/unlike and feedback moderation using a test product and a test submission. This change does not alter existing products, stock, prices, or orders.
