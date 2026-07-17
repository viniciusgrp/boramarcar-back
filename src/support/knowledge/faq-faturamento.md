# Faturamento (assinatura) e Stripe Connect (recebimento de sinal)

São duas integrações Stripe diferentes e independentes no BoraMarcar:

1. **Faturamento (Billing)**: a assinatura mensal que o estabelecimento paga ao BoraMarcar pelo uso do sistema (planos Solo/Pro/Elite).
2. **Stripe Connect**: a conexão da conta Stripe do próprio estabelecimento, usada só para receber o sinal cobrado dos clientes finais.

## Faturamento (Meu plano)

- Só o Dono acessa a tela Faturamento.
- Para assinar ou trocar de plano, o dono é levado ao Checkout do Stripe.
- Existe um Portal do Cliente Stripe (link a partir da tela Faturamento) para o dono atualizar cartão, ver faturas ou cancelar a assinatura.
- Se o dono pagou no Stripe mas o painel ainda não reflete a assinatura ativa, há um botão de "sincronizar assinatura" para forçar a atualização do status.
- O status da assinatura é sincronizado a partir de eventos do Stripe (webhooks); pequenos atrasos de alguns segundos a minutos podem ocorrer.

## Trial (teste gratuito)

- Todo novo estabelecimento começa automaticamente com 14 dias de trial no plano Pro, sem precisar cadastrar cartão.
- Durante o trial, todos os recursos do plano Pro ficam liberados.
- Ao expirar o trial sem assinatura ativa, o acesso ao painel é bloqueado (aparece uma tela informando o trial expirado) até o dono assinar um plano.
- Se o dono assinar durante o trial, a contagem de trial para de valer (a assinatura paga passa a controlar o acesso).
- Se depois de assinar o dono cancelar a assinatura, o sistema pode conceder uma nova janela de acesso temporário (baseada na data em que ele deixou de ter assinatura ativa), mas isso não é um trial "extra": é uma transição de cortesia.

## Stripe Connect (recebimento de sinal)

- Necessário só para estabelecimentos que querem cobrar sinal dos clientes finais.
- Conectar a conta é feito em Configurações → Pagamentos ou na tela Recebimentos: o dono passa por um cadastro guiado do Stripe (Stripe Express).
- Só depois que a conta Stripe estiver com pagamentos habilitados (`charges_enabled`) é que o sistema permite cobrar sinal de fato.
- Na tela Recebimentos, o dono pode abrir o painel (dashboard) do Stripe Express para ver os valores recebidos, repasses e extratos direto no Stripe.
- O BoraMarcar retém uma pequena taxa de plataforma sobre o valor do sinal antes de repassar o restante à conta do estabelecimento (ver base de conhecimento sobre sinal para detalhes).
- Problemas de verificação de identidade, documentos ou conta Stripe do estabelecimento em si devem ser resolvidos diretamente no fluxo do Stripe; se o dono estiver com dificuldade, oriente reabrir o link de onboarding do Connect na tela Recebimentos ou Configurações → Pagamentos.

## Boas práticas para responder

- Nunca informe valores de fatura, últimos 4 dígitos de cartão, ou dados sensíveis de pagamento: esses dados não estão disponíveis para este assistente.
- Para disputas de cobrança, reembolsos de assinatura, ou problemas que a sincronização não resolveu, oriente o atendimento humano.
- Diferencie sempre: "assinatura do BoraMarcar" (Faturamento) é uma coisa; "receber sinal dos clientes" (Stripe Connect) é outra, completamente separada.
