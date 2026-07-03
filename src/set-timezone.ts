// Os horários de agendamento são gravados assumindo servidor em UTC (a hora de
// parede fica no componente UTC do timestamp). Forçamos UTC para o resultado
// ser idêntico em dev (ex.: máquina no Brasil, UTC-3) e em produção.
//
// Importado como primeira linha de main.ts para garantir que o fuso seja
// definido antes de qualquer Date ser criado pelos demais módulos.
process.env.TZ = 'UTC';
