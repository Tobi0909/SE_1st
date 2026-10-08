import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
      <SearchX className="size-6 text-muted-foreground" />
      <div>
        <p className="font-medium">Không tìm thấy nội dung</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Trang hoặc dữ liệu này không tồn tại, hoặc bạn không có quyền xem.
        </p>
      </div>
      <Button size="sm" asChild>
        <Link href="/dashboard">Về dashboard</Link>
      </Button>
    </div>
  );
}
