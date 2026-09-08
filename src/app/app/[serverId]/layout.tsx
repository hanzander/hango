/**
 * Channel UI lives in AppRouteShell so it survives channel switches and
 * can be swapped for servers home in one client frame on Leave.
 */
export default function ServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
