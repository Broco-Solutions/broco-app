"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function TasksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-xl text-center">
      <h1 className="font-display text-2xl text-ink">No pudimos cargar las tareas</h1>
      <p className="mt-2 text-sm text-gray-600">La información no se modificó. Podés intentar nuevamente.</p>
      <Button type="button" className="mt-4" onClick={reset}>Reintentar</Button>
    </Card>
  );
}
