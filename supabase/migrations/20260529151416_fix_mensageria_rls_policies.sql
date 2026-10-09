-- Fix Bug 1: conv_select — `id` sem qualificador resolveu para conversation_members.id (PK)
-- em vez de conversations.id (tabela externa), tornando a condição sempre falsa.
-- Resultado: nenhuma conversa era visível via SELECT → 404 em /mensagens/[id].
DROP POLICY IF EXISTS conv_select ON public.conversations;
CREATE POLICY conv_select ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id          -- referência explícita à tabela externa
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- Fix Bug 2: cmembers_select — cm2.conversation_id = cm2.conversation_id era sempre true,
-- expondo membros de outras conversas para qualquer usuário autenticado.
-- Reescrito com subquery de conversation_ids do próprio usuário.
DROP POLICY IF EXISTS cmembers_select ON public.conversation_members;
CREATE POLICY cmembers_select ON public.conversation_members FOR SELECT
  USING (
    conversation_id IN (
      SELECT cm2.conversation_id
      FROM public.conversation_members cm2
      WHERE cm2.user_id = (SELECT auth.uid())
    )
  );
