import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(err.type === "CredentialsSignin" && (err as { code?: string }).code === "terkunci" ? "/login?error=terkunci" : "/login?error=1");
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <Image src="/logo.png" alt="Logo KDS SDM" width={56} height={56} className="h-14 w-14 object-contain" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">KDS Terpadu</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk sebagai admin SDM</p>

        <form action={login} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error === "terkunci"
                ? "Terlalu banyak percobaan masuk. Akun dikunci sementara; coba lagi sekitar 15 menit lagi."
                : "Email atau password salah."}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-sidebar px-3 py-2 text-sm font-medium text-white hover:bg-sidebar-lighter"
          >
            Masuk
          </button>
        </form>
      </div>
    </main>
  );
}
