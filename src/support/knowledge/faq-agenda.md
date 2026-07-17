# Agenda, disponibilidade e status do agendamento

## Como o cliente final agenda (fluxo público)

1. Acessa o link público do estabelecimento (slug), com a identidade visual (logo, cores) configurada.
2. Escolhe um ou mais serviços e um profissional específico, ou a opção "qualquer profissional".
3. Escolhe o dia e horário disponíveis.
4. Informa seus dados: se o estabelecimento exige conta de cliente, faz login/cadastro; se permite agendar como visitante, informa apenas nome e WhatsApp.
5. Confirma o agendamento. Se houver sinal, é redirecionado ao pagamento; senão, o agendamento já é criado direto (confirmado ou aguardando aprovação, dependendo da configuração).
6. Ao final, vê uma tela de sucesso e pode abrir uma conversa de WhatsApp com o estabelecimento (clique para conversar).

## Como funciona a disponibilidade de horários

- O sistema olha os próximos 21 dias.
- Um dia só aparece disponível se o horário de funcionamento do estabelecimento estiver aberto naquele dia da semana **e** o profissional escolhido também atender nesse dia (interseção entre horário do salão e do profissional).
- Ao escolher "qualquer profissional", o sistema considera aberto o dia em que **pelo menos um** profissional capaz de realizar todos os serviços escolhidos está disponível.
- A duração total do horário reservado é a soma da duração de todos os serviços escolhidos.
- O intervalo entre horários disponíveis (ex.: de 15 em 15 minutos) é configurável pelo estabelecimento em Configurações → Operação (opções comuns: 5, 10, 15, 20, 30 ou 60 minutos).
- Horários já ocupados por outro agendamento (pendente, aguardando pagamento, aguardando aprovação ou confirmado) daquele profissional não aparecem como disponíveis.
- Ausências do profissional (bloqueios de agenda, dia inteiro ou parcial) também removem esses horários da disponibilidade.
- Só aparecem horários futuros (não é possível agendar em horário que já passou no dia atual).

## Status possíveis de um agendamento

| Status | O que significa |
|---|---|
| Aguardando pagamento | O agendamento exige sinal e o cliente ainda não pagou; o horário fica reservado por até 30 minutos. |
| Aguardando aprovação | Não exige sinal, mas o estabelecimento configurou aprovação manual; o dono/gerente precisa aprovar ou rejeitar. |
| Confirmado | Agendamento validado: seja porque não precisa de aprovação manual nem sinal, seja porque o sinal foi pago ou a aprovação manual foi concedida. |
| Cancelado | Agendamento cancelado (pelo cliente, pelo estabelecimento, ou por falta de pagamento do sinal a tempo). Não ocupa mais o horário na agenda. |
| Concluído | O atendimento foi realizado; usado para métricas de faturamento, comissão e pontos de fidelidade. |
| Não compareceu | O cliente não apareceu no horário marcado. |
| Pendente | Status intermediário usado internamente pelo painel (por exemplo, ao reativar um agendamento cancelado); não é o status inicial do fluxo público normal. |

## Regra de qual status nasce o agendamento (fluxo público)

1. Se o serviço exige sinal → nasce como "Aguardando pagamento".
2. Senão, se o estabelecimento exige aprovação manual → nasce como "Aguardando aprovação".
3. Senão → nasce direto "Confirmado".

## Aprovação manual (admin)

- Em Configurações → Operação, o estabelecimento escolhe entre aceitação **automática** (agendamento já nasce confirmado) ou **manual** (dono/gerente precisa aprovar cada agendamento).
- Agendamentos "Aguardando aprovação" aparecem destacados na Agenda; o admin pode aprovar (vira Confirmado) ou rejeitar (vira Cancelado).

## Cancelamento

- **Pelo cliente**: só é possível cancelar agendamentos que ainda não aconteceram e que estejam em status Aguardando pagamento, Aguardando aprovação ou Confirmado. Não há um prazo mínimo de horas fixo no sistema (o cliente pode pedir cancelamento até o momento do horário marcado); eventuais regras específicas de prazo ficam a critério do estabelecimento e dos termos de uso dele com o cliente.
  - Se o estabelecimento permite autocancelamento pelo cliente (opção em Configurações → Operação), o cancelamento é imediato.
  - Se essa opção estiver desligada, o pedido do cliente só registra uma "solicitação de cancelamento" e notifica o dono por e-mail; o dono decide e cancela manualmente pelo painel, se for o caso.
  - Um cliente não pode solicitar cancelamento duas vezes para o mesmo agendamento.
- **Pelo estabelecimento (admin)**: o dono/gerente pode alterar o status do agendamento livremente pela Agenda (cancelar, concluir, marcar não compareceu, reativar um cancelado, etc).
- Cancelar um agendamento com sinal já pago **não** gera reembolso automático (ver base de conhecimento sobre sinal).

## Agendamento interno (feito pelo admin)

- O dono/gerente pode criar agendamentos diretamente na Agenda (por exemplo, para clientes que ligaram ou foram até o local), sem passar pelo fluxo público.

## O que ainda não existe

- Não há integração automática com Google Agenda.
- Não há envio automático de lembretes por WhatsApp (o WhatsApp disponível é só o link de "clique para conversar").
