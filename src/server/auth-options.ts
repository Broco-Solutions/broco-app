import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/server/prisma";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: { email: { label: "Correo", type: "email" }, password: { label: "Contraseña", type: "password" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;
        const user = await prisma.appUser.findUnique({ where: { email } });
        if (!user?.isActive || !(await compare(password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role === "ADMIN" ? "ADMIN" : "COLLABORATOR";
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = String(token.uid);
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "COLLABORATOR";
        session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      }
      return session;
    },
  },
};
