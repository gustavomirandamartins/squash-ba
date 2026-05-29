-- Habilita Realtime para as tabelas de mensageria.
-- Sem isso, postgres_changes não dispara e mensagens só aparecem após refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
