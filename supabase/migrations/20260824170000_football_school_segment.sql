alter table public.companies
  drop constraint if exists companies_service_segment_check;

alter table public.companies
  add constraint companies_service_segment_check
  check (service_segment in ('tecnologia', 'otica', 'escola_futebol', 'generico'));

alter table public.clients
  add constraint clients_company_id_id_unique unique (company_id, id);

create table public.school_guardians (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid,
  full_name text not null,
  document text,
  relationship text,
  email text,
  phone text,
  emergency_phone text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, client_id) references public.clients(company_id, id)
);

create unique index school_guardians_company_document_uidx
  on public.school_guardians(company_id, document)
  where document is not null and document <> '';

create table public.school_athletes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  guardian_id uuid,
  full_name text not null,
  document text,
  birth_date date not null,
  preferred_position text,
  dominant_foot text check (dominant_foot in ('direito', 'esquerdo', 'ambos') or dominant_foot is null),
  category text,
  emergency_contact text,
  medical_notes text,
  image_authorization boolean not null default false,
  data_consent_at timestamptz,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, guardian_id) references public.school_guardians(company_id, id)
);

create unique index school_athletes_company_document_uidx
  on public.school_athletes(company_id, document)
  where document is not null and document <> '';

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  category text not null,
  age_group text,
  coach_name text,
  capacity integer check (capacity is null or capacity > 0),
  schedule jsonb not null default '{}'::jsonb,
  location text,
  default_monthly_fee numeric(14,2) not null default 0 check (default_monthly_fee >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.school_enrollments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  athlete_id uuid not null,
  class_id uuid not null,
  guardian_id uuid,
  starts_at date not null default current_date,
  ends_at date,
  due_day integer not null default 10 check (due_day between 1 and 31),
  monthly_amount numeric(14,2) not null check (monthly_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  status text not null default 'ativa' check (status in ('pendente', 'ativa', 'suspensa', 'encerrada')),
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, athlete_id) references public.school_athletes(company_id, id),
  foreign key (company_id, class_id) references public.school_classes(company_id, id),
  foreign key (company_id, guardian_id) references public.school_guardians(company_id, id)
);

create unique index school_enrollments_active_athlete_class_uidx
  on public.school_enrollments(company_id, athlete_id, class_id)
  where status in ('pendente', 'ativa', 'suspensa');

create table public.school_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  enrollment_id uuid not null,
  athlete_id uuid not null,
  class_id uuid not null,
  attendance_date date not null,
  status text not null check (status in ('presente', 'ausente', 'justificada')),
  notes text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, enrollment_id) references public.school_enrollments(company_id, id) on delete cascade,
  foreign key (company_id, athlete_id) references public.school_athletes(company_id, id),
  foreign key (company_id, class_id) references public.school_classes(company_id, id),
  unique (company_id, enrollment_id, attendance_date)
);

create table public.school_athlete_evaluations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  athlete_id uuid not null,
  evaluation_date date not null default current_date,
  evaluator_name text not null,
  physical_data jsonb not null default '{}'::jsonb,
  technical_data jsonb not null default '{}'::jsonb,
  tactical_data jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (company_id, athlete_id) references public.school_athletes(company_id, id) on delete cascade
);

alter table public.financial_entries
  add column school_enrollment_id uuid;

alter table public.financial_entries
  add constraint financial_entries_school_enrollment_company_fk
  foreign key (company_id, school_enrollment_id)
  references public.school_enrollments(company_id, id);

create index school_guardians_company_idx on public.school_guardians(company_id, active);
create index school_athletes_company_idx on public.school_athletes(company_id, status, full_name);
create index school_classes_company_idx on public.school_classes(company_id, active, name);
create index school_enrollments_company_idx on public.school_enrollments(company_id, status, starts_at);
create index school_attendance_company_date_idx on public.school_attendance(company_id, attendance_date desc, class_id);
create index school_evaluations_company_athlete_idx on public.school_athlete_evaluations(company_id, athlete_id, evaluation_date desc);
create index financial_entries_school_enrollment_idx on public.financial_entries(company_id, school_enrollment_id);

alter table public.school_guardians enable row level security;
alter table public.school_athletes enable row level security;
alter table public.school_classes enable row level security;
alter table public.school_enrollments enable row level security;
alter table public.school_attendance enable row level security;
alter table public.school_athlete_evaluations enable row level security;

create policy school_guardians_company_access on public.school_guardians
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create policy school_athletes_company_access on public.school_athletes
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create policy school_classes_company_access on public.school_classes
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create policy school_enrollments_company_access on public.school_enrollments
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create policy school_attendance_company_access on public.school_attendance
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create policy school_evaluations_select on public.school_athlete_evaluations
for select to authenticated
using (public.company_match(company_id));

create policy school_evaluations_insert on public.school_athlete_evaluations
for insert to authenticated
with check (public.company_match(company_id));

insert into public.permissions (module, action, scope)
select module, action, 'company'
from (
  values
    ('escola', 'visualizar'),
    ('escola', 'criar'),
    ('escola', 'editar'),
    ('escola', 'excluir')
) as school_permissions(module, action)
on conflict (module, action, scope) do nothing;
