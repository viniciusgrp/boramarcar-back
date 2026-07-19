# Visão geral do BoraMarcar

O BoraMarcar é um SaaS de agendamento e gestão para estabelecimentos de serviços (barbearias, salões, studios de estética, etc.), multi-tenant: cada estabelecimento (tenant) tem seus próprios dados, isolados dos demais.

## Para o dono do negócio (painel admin)

Acessível em `/admin`, com estas áreas principais:

- **Início (Dashboard)**: métricas do mês (receita e atendimentos concluídos), link público para compartilhar, checklist de primeiros passos.
- **Agenda**: visão diária por profissional, criação de agendamento interno, aprovação/rejeição, mudança de status.
- **Clientes**: CRM com histórico, sugestões de contato e WhatsApp (somente leitura, não há cadastro manual de cliente pelo admin).
- **Serviços**: cadastro de serviços com nome, duração, preço, sinal (se liberado) e comissão customizada.
- **Equipe**: profissionais que atendem ("Quem atende") e quem tem acesso ao painel ("Acesso ao painel").
- **Configurações**: perfil do estabelecimento, horário de funcionamento, marca/identidade visual, aparência do painel, regras de operação (aceitação automática/manual) e pagamentos (Stripe Connect).
- **Recebimentos**: status do Stripe Connect e acesso ao Express Dashboard (sinais).
- **Faturamento (Meu plano)**: assinatura do estabelecimento (Solo/Pro/Elite), trial, portal do cliente Stripe e complemento **Assistente IA** (R$ 29,90/mês).
- **Financeiro**: relatório de BI com filtros e exportação em CSV.
- **Finanças (Fluxo de caixa)**: abertura/fechamento de caixa, suprimento, sangria, repasses.
- **Despesas fixas**: templates de despesas recorrentes (semanais/mensais).
- **Fidelidade**: programa de pontos, recompensas e indicação ("Indique e Ganhe").
- **Minhas Comissões**: visão do profissional sobre seus atendimentos e comissões.
- **Meu perfil**: dados pessoais, senha, horários e ausências (quando vinculado a um profissional).
- **Suporte**: WhatsApp de contato, formulário de chamado e este assistente de IA (chat flutuante).

## Para o cliente final

- Página pública de agendamento por link (`boramarcar.com/slug-do-estabelecimento`).
- White-label: logo, banner e cor primária do estabelecimento aparecem na página pública.
- Fluxo: escolher serviço(s) e profissional (ou "qualquer profissional") → escolher data/hora → identificar-se (conta ou como visitante, conforme configuração do estabelecimento) → confirmar (com pagamento de sinal quando exigido).
- Pode ter conta de cliente (login) ou agendar como visitante (nome + WhatsApp), dependendo da configuração `require_customer_account` do estabelecimento.

## Suporte

- Este assistente responde dúvidas frequentes sobre o uso do produto, com base na documentação e no contexto do estabelecimento do usuário logado.
- O chat do Assistente IA é um **complemento pago** (não incluso nos planos). O dono contrata em **Faturamento → Assistente IA**, somente com plano ativo (não no trial). Sem o complemento, o chat não aparece.
- Cotas diárias acompanham o plano base (Solo/Pro/Elite). Detalhes em `faq-planos.md`.
- Para problemas urgentes, casos de cobrança específicos, bugs ou dúvidas fora da documentação, oriente **falar com o time humano** (WhatsApp ou formulário em Suporte).
- Nunca prometa reembolsos, descontos ou mudanças de cobrança em nome da empresa: isso é decisão do time humano.

## O que ainda NÃO está no produto (roadmap futuro)

- Integração com Google Agenda (sincronização de calendário).
- WhatsApp Business API automático (hoje o WhatsApp é apenas "clique para conversar", sem envio automático de lembretes/campanhas).
- Exportação de relatórios em Excel/PDF (hoje só existe exportação em CSV no Financeiro).
- Pacotes ou assinaturas recorrentes para o cliente final comprar do estabelecimento.
- Rankings/taxa de ocupação avançada no BI.

Se o usuário perguntar sobre esses itens, informe claramente que ainda não estão disponíveis no produto hoje.
