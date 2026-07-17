# Financeiro, fluxo de caixa, comissões e despesas

Esses recursos exigem plano **Pro** ou **Elite** (não disponíveis no plano Solo).

## Financeiro (relatório / BI)

- Tela "Financeiro" com filtros por período, profissional, serviço, cliente e status do agendamento.
- Duas visualizações: tabela e gráficos.
- Permite exportar os dados filtrados em **CSV**. Não existe exportação em Excel ou PDF hoje.

## Fluxo de caixa

- Tela "Finanças" com um caixa por vez (só é possível ter um caixa aberto no estabelecimento em determinado momento).
- Ações: abrir caixa (com saldo inicial), registrar suprimento (entrada de dinheiro no caixa) e sangria (retirada de dinheiro do caixa), fechar caixa com o resumo de totais.
- Mostra o resumo de entradas e saídas do período.
- Se o estabelecimento ativar "controle de repasses" (opção em Configurações → Pagamentos), aparece uma aba específica para marcar repasses de comissão como pagos aos profissionais, com uma frequência configurável.
- Tem atalho para a tela de despesas fixas.

## Despesas fixas (recorrentes)

- Tela "Despesas fixas": permite cadastrar modelos de despesa recorrente com descrição, categoria, valor, dia de vencimento e frequência (semanal ou mensal).
- O sistema gera automaticamente os lançamentos de despesa no dia de vencimento configurado.
- Hoje só é possível criar e listar despesas fixas pelo painel; não há um botão de excluir um modelo de despesa recorrente.

## Comissões

- Cada profissional pode ter uma porcentagem de comissão configurada em seu cadastro (Equipe → "Quem atende").
- Um serviço específico também pode ter uma comissão customizada, que sobrepõe a comissão padrão do profissional para aquele serviço.
- No plano **Solo**, a comissão sempre fica em 0%, porque a configuração de comissão só é liberada nos planos Pro e Elite.
- A comissão é calculada quando o agendamento é marcado como "Concluído".
- Profissionais têm sua própria tela "Minhas Comissões" para ver o histórico e total de comissões no período (requer que o estabelecimento tenha acesso a recursos financeiros, ou seja, plano Pro/Elite).

## Boas práticas para responder

- Se o dono não vê Financeiro, Finanças (caixa) ou Despesas fixas no menu, provavelmente está no plano Solo: oriente fazer upgrade.
- Se um profissional reclama que a comissão está sempre 0%, verifique se o estabelecimento está no plano Solo (nesse caso é esperado) ou se a comissão não foi configurada no cadastro do profissional/serviço.
