"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <div>
        <p className="font-medium">Có lỗi xảy ra</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Vui lòng thử lại. Nếu lỗi tiếp diễn, báo cho admin.
        </p>
      </div>
      <Button size="sm" onClick={() => reset()}>
        Thử lại
      </Button>
    </div>
  );
}
