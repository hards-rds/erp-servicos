begin;

insert into public.permissions (module, action, scope)
select module, action, 'company'
from (
  values
    ('operacao.vendas'),
    ('operacao.estoque'),
    ('operacao.chamados')
) as modules(module)
cross join (
  values
    ('visualizar'),
    ('criar'),
    ('editar'),
    ('excluir'),
    ('aprovar'),
    ('cancelar'),
    ('emitir'),
    ('conciliar'),
    ('configurar')
) as actions(action)
on conflict (module, action, scope) do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module in ('operacao.vendas', 'operacao.estoque', 'operacao.chamados')
where g.name = 'Master Geral'
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'escola'
where g.name = 'Master Geral'
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'escola'
where g.name in ('Administração', 'Administracao', 'Operação', 'Operacao')
  and p.action in ('visualizar', 'criar', 'editar', 'excluir')
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module in ('operacao.vendas', 'operacao.estoque', 'operacao.chamados')
where g.name in ('Administração', 'Administracao', 'Operação', 'Operacao')
  and p.action in ('visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'cancelar', 'emitir')
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'operacao.vendas'
where g.name = 'Financeiro'
  and p.action = 'visualizar'
on conflict do nothing;

commit;
