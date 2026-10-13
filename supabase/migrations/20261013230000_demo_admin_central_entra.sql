-- Administrador da Central entra na demonstração sem acesso criado e sem prazo (botão "Entrar" da Central).
create or replace function privado.sessao_valida(p_novo_login boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v public.demo_acessos%rowtype;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return jsonb_build_object('valido', false, 'motivo', 'sem_sessao');
  end if;
  if exists (select 1 from public.central_admins a where a.user_id = uid) then
    return jsonb_build_object('valido', true, 'admin', true, 'nome', 'Gestão Sem Caos',
      'login', (select u.email from auth.users u where u.id = uid), 'expira_em', null);
  end if;
  select * into v from public.demo_acessos where user_id = uid;
  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'sem_acesso');
  end if;
  if v.revogado then
    return jsonb_build_object('valido', false, 'motivo', 'revogado');
  end if;
  if v.expira_em <= now() then
    return jsonb_build_object('valido', false, 'motivo', 'expirado');
  end if;
  update public.demo_acessos
     set ultimo_acesso = now(),
         acessos = acessos + case when p_novo_login then 1 else 0 end
   where id = v.id;
  return jsonb_build_object('valido', true, 'nome', v.nome, 'login', v.login, 'expira_em', v.expira_em);
end;
$function$;
