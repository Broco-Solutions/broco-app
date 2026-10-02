export type ActiveInternalProject = { id: string; isActive: boolean; isInternal: boolean };

/** Resolves the one active internal project without relying on a fixed UUID. */
export function resolveActiveInternalProject<T extends ActiveInternalProject>(projects: readonly T[]): T {
  const matches = projects.filter((project) => project.isActive && project.isInternal);
  if (matches.length === 0) throw new Error("No hay un proyecto interno activo configurado.");
  if (matches.length > 1) throw new Error("Hay más de un proyecto interno activo configurado.");
  return matches[0];
}
