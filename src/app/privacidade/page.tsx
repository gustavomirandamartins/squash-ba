import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Política de Privacidade — SquashBa',
  description:
    'Como o SquashBa coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.',
}

export default function PrivacidadePage() {
  return (
    <div
      className="relative min-h-dvh px-6 pb-10 pt-[max(2.5rem,calc(var(--top-inset)+1rem))]"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Link
            href="/ajuda"
            className="flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white/85"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>

        <div className="glass glass-card space-y-6 p-7">
          <header>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Política de Privacidade — SquashBa
            </h1>
            <p className="mt-1 text-sm text-white/45">
              Última atualização: 1 de junho de 2026
            </p>
          </header>

          <p className="text-sm leading-relaxed text-white/70">
            O SquashBa tem como compromisso proteger a privacidade e os dados pessoais de seus
            usuários. Esta Política de Privacidade descreve de forma transparente como coletamos,
            usamos, armazenamos e protegemos suas informações, em estrita conformidade com a Lei
            Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e com as diretrizes das lojas
            de aplicativos (Apple App Store e Google Play Store).
          </p>

          <Section title="1. Quais Dados Coletamos e Bases Legais">
            <p>
              O SquashBa coleta apenas os dados estritamente necessários para a operação da
              plataforma, divididos em duas categorias:
            </p>
            <ul>
              <li>
                <strong className="text-white/80">
                  Dados fornecidos por você (Base legal: Consentimento):
                </strong>{' '}
                Nome, data de nascimento, gênero, e-mail, telefone de contato e foto de perfil.
                Esses dados são essenciais para a criação da sua identidade na comunidade,
                validação de categorias esportivas por idade/gênero, organização de partidas e
                engajamento no ranking.
              </li>
              <li>
                <strong className="text-white/80">
                  Dados coletados automaticamente (Base legal: Legítimo Interesse):
                </strong>{' '}
                Identificadores únicos do dispositivo móvel (ID), dados de log, endereço IP e
                sistema operacional. Essas informações são utilizadas exclusivamente para
                garantir a segurança da plataforma, estabilidade do sistema e prevenção de
                fraudes.
              </li>
            </ul>
          </Section>

          <Section title="2. Privacidade e Visibilidade dos Dados dentro do App">
            <p>
              Para garantir a dinâmica do esporte sem expor sua privacidade, o aplicativo divide
              os dados em dois níveis de acesso:
            </p>
            <ul>
              <li>
                <strong className="text-white/80">Dados Públicos na Comunidade:</strong> Seu
                nome, foto de perfil, gênero, nível de jogo e histórico de partidas/campeonatos
                são visíveis para todos os usuários cadastrados, viabilizando o sistema de
                desafios e rankings.
              </li>
              <li>
                <strong className="text-white/80">Dados Privados e Sigilosos:</strong> Seu
                e-mail e telefone são estritamente privados e visíveis apenas para você e para
                a administração do sistema. Eles são utilizados exclusivamente para fins de
                cadastro, autenticação e segurança. Toda e qualquer comunicação entre os
                jogadores ocorre exclusivamente através do chat interno do aplicativo,
                eliminando a necessidade de exposição de seus dados de contato a terceiros.
              </li>
            </ul>
          </Section>

          <Section title="3. Proteção de Dados de Menores de Idade">
            <p>
              O SquashBa permite a participação de atletas das categorias juvenis. O cadastro de
              usuários menores de 18 anos deve ser realizado obrigatoriamente sob a supervisão e
              com o consentimento expresso de pelo menos um dos pais ou responsável legal,
              manifestado através da declaração de ciência no momento da criação da conta, em
              conformidade com o Artigo 14 da LGPD.
            </p>
          </Section>

          <Section title="4. Cookies e Tecnologias de Rastreamento">
            <p>
              Utilizamos exclusivamente identificadores de sessão essenciais para manter você
              conectado com segurança ao seu perfil. O SquashBa não utiliza nenhum tipo de
              cookie, pixel ou tecnologia de rastreamento para fins de publicidade, marketing ou
              monitoramento de comportamento de terceiros. Seus dados nunca serão vendidos ou
              compartilhados com parceiros comerciais.
            </p>
          </Section>

          <Section title="5. Funcionamento Offline e Armazenamento Local (IndexedDB)">
            <p>
              Para permitir o uso contínuo da plataforma mesmo em locais sem internet, os dados
              de suas partidas e campeonatos podem ser armazenados localmente no seu dispositivo
              através da tecnologia IndexedDB.
            </p>
            <ul>
              <li>
                Essas informações são armazenadas de forma segura no seu navegador/aplicativo e
                são sincronizadas automaticamente com os nossos servidores assim que a conexão
                for restabelecida.
              </li>
              <li>
                Você pode apagar esses dados locais a qualquer momento simplesmente limpando os
                dados do site nas configurações do seu navegador ou dispositivo.
              </li>
            </ul>
          </Section>

          <Section title="6. Armazenamento, Segurança e Retenção">
            <p>
              Os dados coletados são transferidos e armazenados em servidores de nuvem de alta
              confiabilidade, utilizando padrões modernos de segurança da informação, como
              criptografia no trânsito (HTTPS/TLS) e criptografia em repouso, além de rígidos
              controles de acesso administrativo. Os dados permanecem armazenados apenas enquanto
              sua conta estiver ativa.
            </p>
          </Section>

          <Section title="7. Seus Direitos e Exclusão Automatizada de Conta (LGPD)">
            <p>
              Você possui controle total sobre seus dados e pode exercer todos os seus direitos
              garantidos pelo Artigo 18 da LGPD (como acesso, correção e confirmação de
              tratamento) diretamente na interface do app.
            </p>
            <ul>
              <li>
                <strong className="text-white/80">Exclusão Definitiva:</strong> Para apagar
                definitivamente sua conta e remover permanentemente todas as suas informações de
                nossa base de dados, basta acessar a opção{' '}
                <em className="text-white/75">"Excluir Conta"</em> localizada diretamente no
                menu <em className="text-white/75">"Editar perfil"</em>. A exclusão e a
                anonimização dos dados associados são processadas de forma automatizada e
                imediata, exceto por informações cuja conservação seja estritamente obrigatória
                para o cumprimento de obrigações legais.
              </li>
            </ul>
          </Section>

          <Section title="8. Contato do Encarregado pelo Tratamento de Dados (DPO)">
            <p>
              Para esclarecer dúvidas, realizar reclamações ou exercer direitos que não estejam
              disponíveis diretamente na interface, você pode entrar em contato com o nosso
              Encarregado através do e-mail oficial:
            </p>
            <ul>
              <li>
                <strong className="text-white/80">E-mail: </strong>
                <a
                  href="mailto:contato@gustavomartins.com"
                  className="font-medium text-secondary underline-offset-2 hover:underline"
                >
                  contato@gustavomartins.com
                </a>
              </li>
            </ul>
          </Section>

          <Section title="9. Alterações Nesta Política">
            <p>
              Poderemos atualizar esta Política de Privacidade periodicamente para refletir
              melhorias no aplicativo ou mudanças regulatórias. Sempre que uma alteração
              relevante for feita, você será notificado de forma clara através do aplicativo.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-base font-bold text-secondary">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-white/70 [&_ul]:space-y-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-secondary/40">
        {children}
      </div>
    </section>
  )
}
