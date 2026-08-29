import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { reportToCsv } from "@/lib/reports/csv";
import { getReportData } from "@/lib/reports/report-data";
import { parseReportFilters } from "@/lib/reports/types";

export async function GET(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "relatorios", action: "visualizar" });
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === "unauthorized" ? "Nao autenticado." : "Acesso negado." },
      { status: access.reason === "unauthorized" ? 401 : 403 }
    );
  }

  const filters = parseReportFilters(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const report = await getReportData(filters);
  const csv = reportToCsv(report);
  const filename = `relatorio-${filters.report}-${filters.from}-a-${filters.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
