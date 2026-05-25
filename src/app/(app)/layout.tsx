import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <TopBar />
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}
