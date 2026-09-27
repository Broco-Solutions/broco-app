"use server";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { activateAccountToken, hasUsableActivationToken } from "@/server/access-tokens";

export async function activateAccount(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
  if (!(await hasUsableActivationToken(token))) throw new Error("El enlace no es válido o ya venció.");
  await activateAccountToken(token, await hash(password, 12));
  redirect("/login?activated=1");
}
