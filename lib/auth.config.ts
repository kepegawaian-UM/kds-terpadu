import type { NextAuthConfig } from "next-auth";

/**
 * Config dasar TANPA provider yang butuh Prisma (Node.js API) - dipakai proxy.ts (edge
 * middleware) supaya bundle edge-nya tidak ikut menarik Prisma Client, yang gagal kalau
 * ter-bundle ke edge runtime. Provider Credentials (butuh Prisma) baru ditambahkan di
 * lib/auth.ts, yang cuma dipakai dari Route Handler (Node.js runtime).
 */
export const authConfig: NextAuthConfig = {
  // Eksplisit, bukan mengandalkan auto-pickup Auth.js dari process.env.AUTH_SECRET - terbukti
  // auto-pickup itu tidak jalan di deployment produksi (error asli: "MissingSecret").
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
};
