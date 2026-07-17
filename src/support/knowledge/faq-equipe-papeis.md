# Papéis de usuário e equipe

Existem 3 papéis (roles) no painel admin:

- **Dono (OWNER)**: acesso completo ao painel. É quem cria o estabelecimento. Só pode existir 1 dono por estabelecimento. Pode vincular um perfil de profissional para também receber agendamentos.
- **Gerente/Administrador (ADMIN)**: acesso amplo ao painel, mas sem gerenciar a equipe (convites e papéis), sem acessar Faturamento (assinatura) e sem acessar Recebimentos (Stripe Connect). Esses recursos ficam restritos ao Dono. Pode ser vinculado opcionalmente a um perfil de profissional para receber agendamentos, mantendo os acessos de gerente.
- **Colaborador (PROFESSIONAL)**: papel do profissional que atende. Vê apenas sua própria Agenda, seu próprio Perfil e suas próprias Comissões, além do Suporte. Não vê Clientes, Serviços, Financeiro, Equipe, etc. Exige vínculo com um profissional.

## O que cada papel vê no menu do painel

- **Colaborador**: Agenda (só a própria coluna/horários), Meu perfil, Minhas Comissões, Suporte.
- **Gerente (Administrador)**: praticamente todo o painel (incluindo Meu perfil), exceto Meu plano (Faturamento), Recebimentos e a aba "Acesso ao painel" em Equipe (convites e papéis). Se estiver vinculado a um profissional, também recebe agendamentos nesse perfil.
- **Dono**: menu completo, incluindo Faturamento e Recebimentos (este último só aparece quando o sinal está liberado para o estabelecimento).

## Gestão de equipe (tela "Equipe")

- Aba **"Quem atende"**: cadastro dos profissionais que realizam atendimentos (nome, foto, comissão, horários, ausências). Ao criar um profissional, é possível convidar por e-mail para que ele tenha acesso ao painel como Colaborador.
- Aba **"Acesso ao painel"** (só visível para o Dono): convidar novos usuários com papel Gerente ou Colaborador, reenviar ou cancelar convites pendentes, alterar o papel de um usuário já convidado (exceto o próprio Dono), e vincular um usuário Gerente ou Colaborador a um perfil de profissional existente. Para Gerente o vínculo é opcional; para Colaborador é obrigatório.

## Acesso ao produto

- O acesso ao painel admin depende de o estabelecimento ter assinatura ativa **ou** estar dentro do período de trial (14 dias). Se o trial expirar e não houver assinatura ativa, o painel fica bloqueado até o Dono assinar um plano em Faturamento.
- Esse bloqueio vale para todos os papéis (Dono, Gerente, Colaborador), pois é um bloqueio do estabelecimento como um todo, não do usuário individual.

## Boas práticas para responder

- Se um Gerente perguntar por que não acessa Faturamento ou Recebimentos, isso é esperado: esses itens são exclusivos do Dono.
- Se um Gerente perguntar se pode atender clientes: sim, desde que o Dono vincule um profissional a ele em Equipe → Acesso ao painel. Ele continua com os acessos de gerente.
- Se um Colaborador perguntar por que não vê Clientes ou Financeiro, isso também é esperado: o papel de Colaborador é limitado à própria agenda, perfil e comissões.
- Para convites, alteração de papel, ou vínculo de Gerente/Colaborador a um profissional, direcione para a tela Equipe → "Acesso ao painel", que só o Dono pode acessar.
