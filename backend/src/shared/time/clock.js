let provider = () => new Date();

export function clockNow() {
  const value = new Date(provider());
  if (Number.isNaN(value.getTime())) throw new Error("The configured clock returned an invalid instant.");
  return value;
}

// Test-only process-local injection. No HTTP input can control this clock.
export function setClockForTests(nextProvider) {
  if (typeof nextProvider !== "function") throw new TypeError("Clock provider must be a function.");
  provider = nextProvider;
}

export function resetClockForTests() {
  provider = () => new Date();
}
