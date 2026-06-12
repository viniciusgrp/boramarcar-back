import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { endOfDay, startOfDay } from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canConfigureCommissions } from '../professionals/utils/professional-commission.util';
import type { CreateRecurringExpenseTemplateDto } from './dto/create-recurring-expense-template.dto';
import type { RecurringExpenseTemplate } from './entities/recurring-expense-template.entity';
import {
  isRecurringExpenseDueToday,
  normalizeRecurringExpenseFrequency,
  validateRecurringDueDay,
} from './utils/recurring-expense.util';

interface RecurringExpenseTemplateRow {
  id: string;
  tenant_id: string;
  amount: number;
  description: string;
  category: string;
  due_day: number;
  frequency: 'MONTHLY' | 'WEEKLY';
  created_at: string;
}

@Injectable()
export class RecurringExpensesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listTemplates(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<RecurringExpenseTemplate[]> {
    this.assertFinanceAccess(planTier);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('recurring_expenses_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('description', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) =>
      this.mapTemplateRow(row as RecurringExpenseTemplateRow),
    );
  }

  async createTemplate(
    tenantId: string,
    planTier: PlanTier,
    dto: CreateRecurringExpenseTemplateDto,
  ): Promise<RecurringExpenseTemplate> {
    this.assertFinanceAccess(planTier);

    const frequency = normalizeRecurringExpenseFrequency(dto.frequency);
    const description = dto.description?.trim();
    const category = dto.category?.trim();
    const amount = this.roundCurrency(Number(dto.amount));
    const dueDay = Number(dto.dueDay);

    if (amount <= 0) {
      throw new BadRequestException('Informe um valor maior que zero.');
    }

    if (!description) {
      throw new BadRequestException('Informe a descrição da despesa.');
    }

    if (!category) {
      throw new BadRequestException('Informe a categoria da despesa.');
    }

    if (!validateRecurringDueDay(frequency, dueDay)) {
      throw new BadRequestException(
        frequency === 'WEEKLY'
          ? 'Para frequência semanal, informe dueDay entre 1 (segunda) e 7 (domingo).'
          : 'Para frequência mensal, informe dueDay entre 1 e 31.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('recurring_expenses_templates')
      .insert({
        tenant_id: tenantId,
        amount,
        description,
        category,
        due_day: dueDay,
        frequency,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapTemplateRow(data as RecurringExpenseTemplateRow);
  }

  async processDueRecurringExpenses(referenceDate: Date = new Date()): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('recurring_expenses_templates')
      .select('*');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const dayStart = startOfDay(referenceDate).toISOString();
    const dayEnd = endOfDay(referenceDate).toISOString();

    for (const row of (data ?? []) as RecurringExpenseTemplateRow[]) {
      const frequency = normalizeRecurringExpenseFrequency(row.frequency);

      if (!isRecurringExpenseDueToday(frequency, row.due_day, referenceDate)) {
        continue;
      }

      const alreadyGenerated = await this.hasGeneratedExpenseToday(
        row.tenant_id,
        row.description,
        row.category,
        dayStart,
        dayEnd,
      );

      if (alreadyGenerated) {
        continue;
      }

      const { error: insertError } = await this.supabaseService
        .getClient()
        .from('cash_flow_entries')
        .insert({
          tenant_id: row.tenant_id,
          type: 'EXPENSE',
          amount: Number(row.amount),
          description: row.description,
          category: row.category,
          is_recurring: true,
        });

      if (insertError) {
        throw new InternalServerErrorException(insertError.message);
      }
    }
  }

  private async hasGeneratedExpenseToday(
    tenantId: string,
    description: string,
    category: string,
    dayStart: string,
    dayEnd: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('description', description)
      .eq('category', category)
      .eq('is_recurring', true)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .limit(1);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data && data.length > 0);
  }

  private assertFinanceAccess(planTier: PlanTier): void {
    if (!canConfigureCommissions(planTier)) {
      throw new ForbiddenException(
        'Relatório financeiro disponível a partir do plano Pro.',
      );
    }
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private mapTemplateRow(row: RecurringExpenseTemplateRow): RecurringExpenseTemplate {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      amount: Number(row.amount),
      description: row.description,
      category: row.category,
      due_day: Number(row.due_day),
      frequency: normalizeRecurringExpenseFrequency(row.frequency),
      created_at: row.created_at,
    };
  }
}
