// These provider states are observations, never authorization to grant credits.
export const UNSETTLED_PAYMENT_STATES = [
  'processing', 'failed', 'cancelled', 'requires_customer_action',
  'requires_merchant_action', 'requires_payment_method', 'requires_confirmation',
  'requires_capture', 'partially_captured', 'partially_captured_and_capturable',
];
export const PAYMENT_ACTION_COPY: Record<string, string> = {
  requires_customer_action: 'Payment needs your approval. Return to the original Dodo checkout to complete it. No credits have been added.',
  requires_payment_method: 'Payment needs a payment method. Return to the original Dodo checkout. No credits have been added.',
  requires_confirmation: 'Payment is awaiting confirmation. Check the original Dodo checkout before trying another purchase. No credits have been added.',
  requires_merchant_action: 'Payment needs merchant review. Keep your order reference and avoid starting another purchase while it is reviewed.',
  requires_capture: 'Payment is authorized but not captured. Credits will be added only after full payment is confirmed.',
  partially_captured: 'Only part of the payment was captured. This purchase needs review; no video credits have been added.',
  partially_captured_and_capturable: 'Only part of the payment was captured. The remaining payment needs completion or review; no video credits have been added.',
};
export const RESUMABLE_PAYMENT_STATES = ['pending', 'requires_customer_action', 'requires_payment_method', 'requires_confirmation'];
