/**
 * Enterprise gate components - no-op in open-source version.
 * All features are available. This file exists only for import compatibility.
 */

export function EnterpriseGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function EnterpriseUpgradePrompt() {
  return null;
}

export function EnterpriseFeatureBadge() {
  return null;
}
