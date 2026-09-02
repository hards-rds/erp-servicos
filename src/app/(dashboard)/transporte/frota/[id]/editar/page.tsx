import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm, type VehicleFormValue } from "@/components/transport/vehicle-form";
import { getTransportContext } from "@/lib/transport/server";
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const context = await getTransportContext("frota", "editar"); if (!context.ok) notFound(); const { data } = await context.supabase.from("transport_vehicles").select("*").eq("company_id", context.profile.company_id).eq("id", id).maybeSingle(); if (!data) notFound(); return <><PageHeader area="Transporte / Frota / Editar" title={data.plate} description="Atualize os dados operacionais do veiculo." action={<a className="ghost-button button-link" href="/transporte/frota">Voltar para frota</a>} /><section className="form-panel page-form-panel"><VehicleForm vehicle={data as VehicleFormValue} /></section></>; }
