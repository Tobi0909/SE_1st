"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="vi">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-center text-foreground">
        <p className="font-medium">Ứng dụng gặp lỗi</p>
        <p className="text-sm text-muted-foreground">Vui lòng tải lại trang.</p>
        <button
          onClick={() => reset()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Thử lại
        </button>
      </body>
    </html>
  );
}
