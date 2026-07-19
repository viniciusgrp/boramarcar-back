# Onboarding: checklist de primeiros passos

O painel exibe um checklist de primeiros passos no Início (Dashboard), visível apenas para o Dono (OWNER), com o progresso calculado em tempo real. Passos, em ordem:

1. **Serviços**: cadastrar ao menos 1 serviço em Serviços.
2. **Profissionais**: cadastrar ao menos 1 profissional em Equipe → "Quem atende".
3. **Horários de funcionamento**: configurar ao menos 1 dia aberto em Configurações → Horários.
4. **Informações do estabelecimento**: ter visitado a tela de Configurações **e** ter telefone de contato preenchido (ou endereço com rua e cidade).
5. **Página pública**: adicionar logo ou banner em Configurações → Marca (identidade visual da página de agendamento).
6. **Cadastro do cliente**: decidir a política de conta do cliente (exigir conta de cliente ou permitir agendamento como visitante) em Configurações → Operação.
7. **Agendamento de teste**: ter pelo menos 1 agendamento registrado no estabelecimento (pode ser feito por um agendamento interno ou pelo próprio link público).
8. **Recebimento de sinais**: só aparece se o estabelecimento exigir Stripe Connect (uso de sinal). Completo quando o Connect está com `charges_enabled` (pagamentos habilitados). Só o Dono vê e resolve este passo.
9. **Ativar assinatura**: ter uma assinatura ativa (não apenas em trial) em Faturamento.

O checklist é considerado completo quando todos os passos obrigatórios (mais o de Stripe Connect, se aplicável) estão concluídos e a assinatura está ativa.

## Dicas práticas para responder dúvidas de onboarding

- Se o dono perguntar "por que meu checklist não fecha", verifique com ele: tem serviço, profissional, horário configurado, telefone e visitou Configurações, logo/banner enviado, decidiu a política de conta do cliente, tem 1 agendamento e (se aplicável) o Stripe Connect está habilitado.
- Compartilhar o link público de agendamento é importante para o negócio, mas **não é** um passo formal do checklist atual.
- O ideal é orientar o dono a seguir a ordem do checklist, pois cada etapa desbloqueia a seguinte parte do fluxo de agendamento (ex.: sem serviço e profissional, o cliente final não conseguirá agendar).
