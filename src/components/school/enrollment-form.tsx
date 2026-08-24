"use client";

import { useState } from "react";

type AthleteOption = { id: string; full_name: string; category: string | null };
type ClassOption = { id: string; name: string; category: string; default_monthly_fee: number };
export type EnrollmentValue = { id?: string; athlete_id?: string; class_id?: string; starts_at?: string; ends_at?: string | null; due_day?: number; monthly_amount?: number; discount_amount?: number; status?: string; notes?: string | null };

export function EnrollmentForm({ athletes, classes, enrollment }: { athletes: AthleteOption[]; classes: ClassOption[]; enrollment?: EnrollmentValue }) {
  const initialClass = classes.find((item) => item.id === enrollment?.class_id);
  const [classId, setClassId] = useState(enrollment?.class_id || "");
  const [amount, setAmount] = useState(Number(enrollment?.monthly_amount ?? initialClass?.default_monthly_fee ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  function changeClass(nextId: string) {
    setClassId(nextId);
    const selected = classes.find((item) => item.id === nextId);
    if (selected && !enrollment?.id) setAmount(Number(selected.default_monthly_fee).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  }
  return <form className="form-stack" action="/api/escola/matriculas" method="post">
    <input type="hidden" name="action" value={enrollment?.id ? "update" : "create"} />{enrollment?.id ? <input type="hidden" name="enrollmentId" value={enrollment.id} /> : null}
    <label>Atleta<select name="athleteId" defaultValue={enrollment?.athlete_id || ""} required><option value="">Selecione um atleta</option>{athletes.map((athlete) => <option value={athlete.id} key={athlete.id}>{athlete.full_name}{athlete.category ? ` - ${athlete.category}` : ""}</option>)}</select></label>
    <label>Turma<select name="classId" value={classId} onChange={(event) => changeClass(event.target.value)} required><option value="">Selecione uma turma</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name} - {item.category}</option>)}</select></label>
    <div className="form-grid"><label>Inicio<input name="startsAt" type="date" defaultValue={enrollment?.starts_at || new Date().toISOString().slice(0, 10)} required /></label><label>Termino<input name="endsAt" type="date" defaultValue={enrollment?.ends_at || ""} /></label></div>
    <div className="form-grid"><label>Mensalidade<input name="monthlyAmount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Desconto<input name="discountAmount" inputMode="decimal" defaultValue={Number(enrollment?.discount_amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} required /></label></div>
    <div className="form-grid"><label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={enrollment?.due_day || 10} required /></label><label>Status<select name="status" defaultValue={enrollment?.status || "ativa"}><option value="pendente">Pendente</option><option value="ativa">Ativa</option><option value="suspensa">Suspensa</option><option value="encerrada">Encerrada</option></select></label></div>
    <label>Observacoes<textarea name="notes" defaultValue={enrollment?.notes || ""} /></label>
    <button className="primary-button" type="submit">{enrollment?.id ? "Salvar alteracoes" : "Criar matricula"}</button>
  </form>;
}
