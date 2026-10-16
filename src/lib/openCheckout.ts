// Navigation is separate from checkout creation/reconciliation so UI lifecycle
// guards can be tested without opening a payment session in the test runner.
export function openCheckout(url: string) {
  window.location.assign(url);
}
