import { AppRouteShell } from "@/components/app/AppRouteShell";

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppRouteShell>{children}</AppRouteShell>;
}
