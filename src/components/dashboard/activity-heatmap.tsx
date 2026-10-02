import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityDay } from "@/lib/dashboard/activity";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["T2", "", "T4", "", "T6", "", "CN"];

// Thang màu sequential 1 hue (xanh accent), đậm dần theo cường độ hoạt động — không phải màu
// phân loại nên không chạy qua validator categorical (sequential ramp luôn FAIL check đó
// theo thiết kế, xem skill dataviz).
const LEVEL_CLASS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/50",
  "bg-primary/75",
  "bg-primary",
];

function levelOf(count: number): number {
  if (count <= 0) return 0;
  if (count >= 4) return 4;
  return count;
}

function mondayIndex(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  return (day + 6) % 7;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ActivityHeatmap({ data }: { data: ActivityDay[] }) {
  if (data.length === 0) return null;

  const cells: (ActivityDay | null)[] = [...Array(mondayIndex(data[0].date)).fill(null), ...data];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (ActivityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className="h-[11px] text-[10px] leading-[11px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) =>
              day ? (
                <Tooltip key={di}>
                  <TooltipTrigger asChild>
                    <div
                      tabIndex={0}
                      className={cn(
                        "size-[11px] rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        LEVEL_CLASS[levelOf(day.count)],
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {day.count} hoạt động · {formatDate(day.date)}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={di} className="size-[11px]" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Ít</span>
        {LEVEL_CLASS.map((cls, i) => (
          <div key={i} className={cn("size-[11px] rounded-[2px]", cls)} />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
}
