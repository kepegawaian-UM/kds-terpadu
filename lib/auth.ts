import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

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

          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.nama };
        } catch (err) {
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
