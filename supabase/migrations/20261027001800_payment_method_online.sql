-- =============================================================================
-- Shopverse · Migration 018 · "online" payment method
--
-- An online order's method is "online" until the payment arrives; it then
-- becomes what the customer actually used (upi, card, netbanking, wallet).
-- Kept alone: a new enum value can't be used in the transaction that adds it.
-- =============================================================================
alter type public.payment_method add value if not exists 'online';
