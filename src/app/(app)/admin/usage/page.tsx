import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminUsagePage() {
  await requireAdmin();

  const [totalByFeature, successByFeature, recent] = await Promise.all([
    db.llmUsageLog.groupBy({
      by: ["feature"],
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
      _avg: { latencyMs: true },
      orderBy: { feature: "asc" },
    }),
    db.llmUsageLog.groupBy({
      by: ["feature"],
      where: { success: true },
      _count: { _all: true },
    }),
    db.llmUsageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const successMap = new Map(successByFeature.map((s) => [s.feature, s._count._all]));
  const rows = totalByFeature.map((t) => ({
    feature: t.feature,
    total: t._count._all,
    success: successMap.get(t.feature) ?? 0,
    promptTokens: t._sum.promptTokens ?? 0,
    completionTokens: t._sum.completionTokens ?? 0,
    avgLatencyMs: Math.round(t._avg.latencyMs ?? 0),
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Thống kê gọi LLM</h1>

      <Card>
        <CardHeader>
          <CardTitle>Theo tính năng</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt gọi LLM nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-normal">Feature</th>
                  <th className="py-2 font-normal">Số lần gọi</th>
                  <th className="py-2 font-normal">Thành công</th>
                  <th className="py-2 font-normal">Latency TB</th>
                  <th className="py-2 font-normal">Tokens (in/out)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature} className="border-b last:border-0">
                    <td className="py-2">{r.feature}</td>
                    <td className="py-2">{r.total}</td>
                    <td className="py-2">
                      {r.success}/{r.total}
                    </td>
                    <td className="py-2">{r.avgLatencyMs}ms</td>
                    <td className="py-2">
                      {r.promptTokens}/{r.completionTokens}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>20 lượt gọi gần nhất</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {recent.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">
                  {log.feature} · {log.user?.name ?? "(hệ thống)"}
                </p>
                <p className="text-xs text-muted-foreground">{log.model}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={log.success ? "default" : "destructive"}>
                  {log.success ? "OK" : "Lỗi"}
                </Badge>
                <span className="text-xs text-muted-foreground">{log.latencyMs}ms</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
