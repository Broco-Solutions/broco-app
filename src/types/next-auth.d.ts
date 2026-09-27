import "next-auth";
import "next-auth/jwt";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session { user: { id: string; role: "ADMIN" | "COLLABORATOR"; sessionVersion: number } & DefaultSession["user"] }
  interface User { role?: "ADMIN" | "COLLABORATOR"; sessionVersion?: number }
}

declare module "next-auth/jwt" {
  interface JWT { uid?: string; role?: "ADMIN" | "COLLABORATOR"; sessionVersion?: number }
}
