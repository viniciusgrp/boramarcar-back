# Planos BoraMarcar (assinatura do estabelecimento)

Existem 3 planos: **Solo**, **Pro** e **Elite**. A gestão da assinatura (escolher plano, ver trial, portal de pagamento) fica em **Faturamento → Meu plano**, disponível apenas para o Dono (OWNER).

## O que cada plano libera

| Recurso | Solo | Pro | Elite |
|---|---|---|---|
| Profissionais ativos | até 1 | até 5 | ilimitado |
| Financeiro (relatórios/BI, exportar CSV) | Não | Sim | Sim |
| Fluxo de caixa (abrir/fechar caixa, sangria, suprimento) | Não | Sim | Sim |
| Comissões por profissional/serviço | Não (fica em 0%) | Sim | Sim |
| Despesas fixas (recorrentes) | Não | Sim | Sim |
| Customizar cores do painel admin | Não | Sim | Sim |
| Sinal (cobrança de depósito no agendamento) | Não* | Não* | Sim |
| Fidelidade (pontos, recompensas, indicação) | Sim | Sim | Sim |
| Assistente IA (chat de suporte no painel) | Complemento* | Complemento* | Complemento* |

\* Sinal também pode ser liberado independentemente do plano se o estabelecimento tiver a flag especial `deposit_feature_enabled` habilitada manualmente (caso avaliado individualmente pela equipe BoraMarcar).

\* Assistente IA é um **complemento pago** (R$ 29,90/mês), não incluso nos planos. Contrata em **Faturamento → Assistente IA**, só com plano **ativo** (não no trial). A cota diária de mensagens acompanha o plano base: Solo 40/dia (20 por usuário), Pro 100/dia (40 por usuário), Elite 200/dia (50 por usuário).

Se o dono perguntar por que não vê "Financeiro", "Fluxo de caixa" ou "Comissões" no menu, a causa mais comum é estar no plano **Solo**. Para liberar, é preciso fazer upgrade para Pro ou Elite.

Se o dono perguntar por que não pode adicionar mais profissionais, o limite do plano foi atingido:
- Solo: 1 profissional ativo.
- Pro: 5 profissionais ativos.
- Elite: sem limite.

## Trial (teste gratuito)

- Todo novo estabelecimento nasce com **14 dias de trial no plano Pro**, com acesso completo aos recursos do Pro durante esse período.
- Após o trial expirar sem assinatura ativa, o acesso ao painel é bloqueado até o dono assinar um plano.
- Ao assinar (status da assinatura fica "ativo"), o período de trial não conta mais; se depois a assinatura for cancelada, pode haver uma nova janela de acesso temporário a partir da data em que a assinatura ficou inativa.

## Faturamento

- Assinar/mudar de plano é feito via Checkout do Stripe (Solo, Pro ou Elite).
- Há um Portal do Cliente Stripe para gerenciar forma de pagamento, cancelar ou trocar plano.
- Em caso de pagamento não reconhecido pelo sistema depois de pago no Stripe, existe uma opção de "sincronizar assinatura" na tela de Faturamento.
- O **Assistente IA** é contratado na mesma assinatura (item extra). Remoção e ajustes de pagamento do complemento também passam pelo portal.

## Recebimento de sinal (Stripe Connect)

- É um recurso separado da assinatura: mesmo em plano Elite (ou com a flag especial), é necessário conectar a conta Stripe do estabelecimento (Stripe Connect) em Configurações → Pagamentos ou em Recebimentos, para poder cobrar e receber sinais dos clientes.

Se a função que o usuário procura não estiver disponível, o motivo é quase sempre: limitação do plano atual, ou uma configuração pendente (ex.: Stripe Connect não conectado). Oriente a verificar o plano em Faturamento antes de escalar para o time humano.
