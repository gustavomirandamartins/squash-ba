// Texto dos Termos de Uso — usado na página /termos e na tela de aceite.

import Link from 'next/link'

export const TERMS_UPDATED_AT = '9 de outubro de 2026'

export function TermsContent() {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-white/70">
        Estes Termos de Uso valem para o aplicativo e o site do SquashBa. Ao criar sua conta ou
        continuar usando o app, você concorda com eles. Leia também a nossa{' '}
        <Link href="/privacidade" className="text-secondary underline-offset-2 hover:underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <Section title="1. O que é o SquashBa">
        <p>
          O SquashBa é uma comunidade de jogadores de squash: campeonatos, desafios, ranking,
          mensagens e um feed para compartilhar fotos, vídeos e comentários.
        </p>
      </Section>

      <Section title="2. Quem opera o SquashBa">
        <p>O SquashBa é operado por Gustavo Miranda Martins, em Salvador, Bahia.</p>
      </Section>

      <Section title="3. Sua conta">
        <ul>
          <li>Use dados verdadeiros: seu nome e sua foto, não os de outra pessoa.</li>
          <li>A conta é pessoal. Não compartilhe seu acesso.</li>
          <li>Você é responsável pelo que publica e envia pelo app.</li>
        </ul>
      </Section>

      <Section title="4. Idade mínima">
        <p>
          O SquashBa pode ser usado a partir dos 13 anos. Menores de 18 anos precisam da
          autorização de um responsável legal para usar o app.
        </p>
      </Section>

      <Section title="5. O que não é permitido">
        <p>No feed, nos comentários, nas mensagens e no perfil, é proibido:</p>
        <ul>
          <li>
            <strong className="text-white/80">Conteúdo ofensivo:</strong> discurso de ódio,
            discriminação, violência, conteúdo sexual ou impróprio.
          </li>
          <li>
            <strong className="text-white/80">Assédio:</strong> ameaças, intimidação, ofensas
            pessoais ou insistir em contato com quem não quer.
          </li>
          <li>
            <strong className="text-white/80">Spam:</strong> propaganda não solicitada,
            mensagens repetidas, golpes ou links enganosos.
          </li>
          <li>
            <strong className="text-white/80">Perfil falso:</strong> se passar por outra pessoa
            ou criar contas para enganar outros jogadores.
          </li>
        </ul>
        <p>Não há tolerância para conteúdo ofensivo ou abusivo.</p>
      </Section>

      <Section title="6. Denúncia e bloqueio">
        <ul>
          <li>
            Você pode denunciar posts, comentários, mensagens e perfis pelo menu{' '}
            <strong className="text-white/80">⋯</strong>.
          </li>
          <li>
            Todas as denúncias são analisadas pela equipe do SquashBa. Se houver violação destes
            termos, o conteúdo pode ser removido e a conta responsável pode ser excluída.
          </li>
          <li>
            Você pode bloquear qualquer usuário. Vocês deixam de ver o conteúdo um do outro e
            não trocam mais mensagens diretas. O desbloqueio fica no seu perfil.
          </li>
        </ul>
      </Section>

      <Section title="7. Campeonatos e resultados">
        <p>
          Organizadores e jogadores devem registrar placares verdadeiros. Resultados
          manipulados podem ser corrigidos ou removidos pela organização.
        </p>
      </Section>

      <Section title="8. Exclusão da conta">
        <p>
          Você pode excluir sua conta a qualquer momento no seu perfil. O SquashBa também pode
          excluir contas que violem estes termos.
        </p>
      </Section>

      <Section title="9. Mudanças nos termos">
        <p>
          Podemos atualizar estes termos. Quando a mudança for relevante, pediremos um novo
          aceite antes de você continuar usando o app.
        </p>
      </Section>

      <Section title="10. Contato">
        <p>
          Dúvidas sobre estes termos: pelo e-mail{' '}
          <a href="mailto:contato@gustavomartins.com" className="text-secondary underline-offset-2 hover:underline">
            contato@gustavomartins.com
          </a>{' '}
          ou pela{' '}
          <Link href="/ajuda" className="text-secondary underline-offset-2 hover:underline">
            página de Ajuda
          </Link>{' '}
          do app.
        </p>
      </Section>

      <Section title="11. Lei e foro">
        <p>
          Estes termos seguem a legislação brasileira. Fica eleito o foro da comarca de
          Salvador, Bahia, para resolver questões relacionadas a eles.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-base font-bold text-secondary">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-white/70 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-4 [&_ul]:marker:text-secondary/40">
        {children}
      </div>
    </section>
  )
}
