-- Bucket público para banners de patrocinador.
-- O admin sobe os arquivos manualmente no Supabase; a home lista e rotaciona por usuário.
-- Sem tabela/RLS de aplicação: leitura pública via policy de SELECT em storage.objects.

insert into storage.buckets (id, name, public)
values ('sponsors', 'sponsors', true)
on conflict (id) do update set public = true;

drop policy if exists "sponsors_public_read" on storage.objects;
create policy "sponsors_public_read"
  on storage.objects for select
  using (bucket_id = 'sponsors');
