# Sinal (depósito) no agendamento

O sinal é um valor fixo em reais, pago pelo cliente no momento do agendamento, para reservar o horário. Configurado por serviço em Serviços (campo de sinal), não é uma porcentagem.

## Quando o sinal é cobrado

- Só quando o serviço escolhido tem sinal configurado (valor fixo maior que zero).
- Só se o recurso de sinal estiver liberado para o estabelecimento: plano **Elite** ou a flag especial de sinal habilitada manualmente pela equipe.
- Só se o estabelecimento tiver conectado o **Stripe Connect** e estiver com pagamentos habilitados (`charges_enabled`).
- Se o cliente usa pontos de fidelidade para resgatar o serviço, não há cobrança de sinal nesse agendamento.
- Se o carrinho tem múltiplos serviços, o sinal cobrado é a soma dos sinais de cada serviço que exige sinal.

## Como funciona o fluxo de pagamento

1. Ao confirmar o agendamento com sinal, o horário é reservado com status "Aguardando pagamento" e fica em espera (hold) por **30 minutos**.
2. O cliente é redirecionado para o Checkout do Stripe para pagar o sinal.
3. Se o pagamento é concluído dentro dos 30 minutos, o agendamento passa para "Confirmado" e o sinal fica marcado como pago.
4. Se o cliente não pagar a tempo (expira o checkout, fecha a página, ou o prazo de 30 minutos passa), o horário é liberado automaticamente e o agendamento fica cancelado. Uma rotina automática (a cada 15 minutos) verifica e cancela reservas com pagamento pendente vencidas.
5. Se, por algum motivo raro, o pagamento chegar depois do horário já ter sido liberado/cancelado, o sistema estorna automaticamente esse pagamento (reembolso automático), já que a reserva não é mais válida.

## Cancelamento e reembolso

- Se o agendamento já foi confirmado e o sinal já foi pago, e depois o agendamento é cancelado (pelo cliente ou pelo estabelecimento), **não há reembolso automático do sinal**. A decisão de reembolsar ou não, nesse caso, é sempre manual e deve ser tratada pelo dono do estabelecimento (fora do sistema) ou, para casos de erro de cobrança, pelo time humano do BoraMarcar.
- O único reembolso automático do sistema é o caso de pagamento tardio após o horário já ter sido liberado (item acima), que não é uma decisão do estabelecimento, é uma proteção automática do sistema.

## Taxa sobre o sinal

- O BoraMarcar pode reter uma pequena porcentagem do valor do sinal como taxa de plataforma (taxa de aplicação do Stripe Connect) antes de repassar o restante para a conta do estabelecimento. Essa porcentagem é configurável por estabelecimento pela equipe BoraMarcar; o padrão do sistema é 0% salvo configuração em contrário.

## Boas práticas para responder

- Nunca prometa reembolso automático de sinal em caso de cancelamento comum. Isso só acontece no caso específico de pagamento tardio após liberação do horário.
- Para dúvidas sobre um caso específico de cobrança, pedir estorno manual, ou desacordo sobre um pagamento, oriente o usuário a acionar o atendimento humano informando o horário do agendamento e, se possível, o nome do cliente.
- Não cite valores de porcentagem de taxa sem confirmar com o time humano, pois pode variar por estabelecimento.
