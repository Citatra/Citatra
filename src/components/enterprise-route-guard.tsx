/**
 * Enterprise route guard - no-op in open-source version.
 * All routes are accessible. This file exists only for import compatibility.
 */

export function EnterpriseRouteGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
