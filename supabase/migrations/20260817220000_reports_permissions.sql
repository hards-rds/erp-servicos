begin;

insert into public.permissions (module, action, scope)
values ('relatorios', 'visualizar', 'company')
on conflict (module, action, scope) do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p
  on p.module = 'relatorios'
 and p.action = 'visualizar'
where g.name in ('Master Geral', 'Administracao', 'Financeiro', 'Fiscal', 'Cadastros', 'Operacao')
on conflict do nothing;

commit;
