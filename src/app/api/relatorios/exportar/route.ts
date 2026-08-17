import { NextRequest, NextResponse } from "next/server";
import { reportToCsv } from "@/lib/reports/csv";
import { getReportData } from "@/lib/reports/report-data";
import { parseReportFilters } from "@/lib/reports/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

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
