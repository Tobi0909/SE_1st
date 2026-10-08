import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
