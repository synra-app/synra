/** Single wall-clock budget for one LAN discovery run (mDNS/UDP window + Synra TCP probe slice). */
export const DEFAULT_SYNRA_SCAN_BUDGET_MS = 2200

/**
 * Splits scan budget between native browse/broadcast and Synra probe without a second JS-level timeout knob.
 */
export function synraDiscoveryTimeoutsFromBudget(scanBudgetMs: number): {
  discoveryTimeoutMs: number
  probeTimeoutMs: number
} {
  const budget = Math.max(600, Math.floor(scanBudgetMs))
  const probeTimeoutMs = Math.min(900, Math.max(350, Math.floor(budget * 0.38)))
  const discoveryTimeoutMs = Math.max(200, budget - probeTimeoutMs - 80)
  return { discoveryTimeoutMs, probeTimeoutMs }
}
