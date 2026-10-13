import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";

import { Sidebar } from "./Sidebar";

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar
        userName={session.user.name ?? "Admin"}
        userEmail={session.user.email ?? ""}
        onSignOut={doSignOut}
      />
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
