import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { periksaMasuk } from "@/lib/auth/masuk";

/** Dilempar bila akun terkunci karena terlalu banyak percobaan; kode dibaca halaman login untuk menampilkan pesan yang tepat. */
class AkunTerkunci extends CredentialsSignin {
  code = "terkunci";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        try {
          const email = typeof credentials?.email === "string" ? credentials.email : undefined;
          const password =
            typeof credentials?.password === "string" ? credentials.password : undefined;
          if (!email || !password) return null;

          const hasil = await periksaMasuk(prisma, email, password);
          if (hasil.ok) return { id: hasil.user.id, email: hasil.user.email, name: hasil.user.nama };
          if (hasil.alasan === "terkunci") throw new AkunTerkunci();
          return null;
        } catch (err) {
          if (err instanceof AkunTerkunci) throw err;
          // NextAuth membungkus SEMUA error di authorize() jadi pesan generik "server
          // configuration" di production - tanpa log eksplisit ini, error aslinya (mis.
          // Prisma tidak bisa connect) tidak pernah kelihatan di mana pun.
          console.error("[authorize] gagal:", err);
          throw err;
        }
      },
    }),
  ],
});
