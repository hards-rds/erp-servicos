import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { currentCompetence, formatCompetence, shiftCompetence } from "@/lib/dates/competence";

type CompetenceFilterProps = {
  value: string;
  pathname: string;
  params?: Record<string, string | undefined>;
};

function competenceHref(pathname: string, competence: string, params?: Record<string, string | undefined>) {
  const query = new URLSearchParams({ competence });
  for (const [key, value] of Object.entries(params || {})) {
    if (value) query.set(key, value);
  }
  return `${pathname}?${query.toString()}`;
}

export function CompetenceFilter({ value, pathname, params }: CompetenceFilterProps) {
  const current = currentCompetence();
  const previous = shiftCompetence(value, -1);
  const next = shiftCompetence(value, 1);

  return (
    <section className="competence-filter" aria-label="Filtro por competencia">
      <div className="competence-filter-summary">
        <CalendarDays aria-hidden="true" size={19} />
        <span>
          <small>Competencia selecionada</small>
          <strong>{formatCompetence(value)}</strong>
        </span>
      </div>
      <div className="competence-filter-controls">
        <Link className="icon-button" href={competenceHref(pathname, previous, params)} aria-label="Mes anterior" title="Mes anterior">
          <ChevronLeft aria-hidden="true" size={19} />
        </Link>
        <form action={pathname} method="get">
          {Object.entries(params || {}).map(([key, paramValue]) => paramValue ? <input key={key} type="hidden" name={key} value={paramValue} /> : null)}
          <label>
            <span className="sr-only">Competencia</span>
            <input name="competence" type="month" defaultValue={value} required />
          </label>
          <button className="ghost-button compact-button" type="submit">Aplicar</button>
        </form>
        <Link className="icon-button" href={competenceHref(pathname, next, params)} aria-label="Proximo mes" title="Proximo mes">
          <ChevronRight aria-hidden="true" size={19} />
        </Link>
        {value !== current ? <Link className="ghost-button compact-button" href={competenceHref(pathname, current, params)}>Mes atual</Link> : null}
      </div>
    </section>
  );
}
