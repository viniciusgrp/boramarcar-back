import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canConfigureCommissions } from '../professionals/utils/professional-commission.util';
import type {
  CashRegisterStatusResponse,
  CloseCashRegisterResponse,
  DailyCashRegister,
} from './entities/daily-cash-register.entity';
import type { CashRegisterMovementType } from './dto/cash-register-entry.dto';

interface CashRegisterRow {
  id: string;
  tenant_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
}

interface CashFlowPeriodRow {
  type: 'REVENUE' | 'EXPENSE';
  amount: number;
}

@Injectable()
export class CashRegisterService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getCashRegisterStatus(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<CashRegisterStatusResponse> {
    this.assertFinanceAccess(planTier);

    const openRegister = await this.findOpenCashRegister(tenantId);

    if (!openRegister) {
      return { register: null };
    }

    const periodTotals = await this.calculatePeriodTotals(openRegister.id);

    return {
      register: {
        id: openRegister.id,
        openingBalance: Number(openRegister.opening_balance),
        openedAt: openRegister.opened_at,
        status: openRegister.status,
        estimatedBalance: this.roundCurrency(
          Number(openRegister.opening_balance) +
            periodTotals.revenue -
            periodTotals.expenses,
        ),
        periodRevenue: periodTotals.revenue,
        periodExpenses: periodTotals.expenses,
      },
    };
  }

  async openCashRegister(
    tenantId: string,
    planTier: PlanTier,
    userId: string,
    openingBalance: number,
  ): Promise<DailyCashRegister> {
    this.assertFinanceAccess(planTier);

    const normalizedOpeningBalance = this.roundCurrency(openingBalance);

    if (normalizedOpeningBalance < 0) {
      throw new BadRequestException(
        'O saldo de abertura deve ser maior ou igual a zero.',
      );
    }

    const existingOpenRegister = await this.findOpenCashRegister(tenantId);

    if (existingOpenRegister) {
      throw new BadRequestException(
        'Já existe um caixa aberto para este estabelecimento.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('daily_cash_registers')
      .insert({
        tenant_id: tenantId,
        opened_by: userId,
        opening_balance: normalizedOpeningBalance,
        status: 'OPEN',
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapCashRegisterRow(data as CashRegisterRow);
  }

  async closeCashRegister(
    tenantId: string,
    planTier: PlanTier,
    userId: string,
    closingBalance: number,
  ): Promise<CloseCashRegisterResponse> {
    this.assertFinanceAccess(planTier);

    const openRegister = await this.findOpenCashRegister(tenantId);

    if (!openRegister) {
      throw new BadRequestException('Não há caixa aberto para fechar.');
    }

    const normalizedClosingBalance = this.roundCurrency(closingBalance);

    if (normalizedClosingBalance < 0) {
      throw new BadRequestException(
        'O saldo de fechamento deve ser maior ou igual a zero.',
      );
    }

    const periodTotals = await this.calculatePeriodTotals(openRegister.id);
    const expectedBalance = this.roundCurrency(
      Number(openRegister.opening_balance) +
        periodTotals.revenue -
        periodTotals.expenses,
    );
    const discrepancy = this.roundCurrency(
      normalizedClosingBalance - expectedBalance,
    );
    const closedAt = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('daily_cash_registers')
      .update({
        status: 'CLOSED',
        closing_balance: normalizedClosingBalance,
        closed_by: userId,
        closed_at: closedAt,
      })
      .eq('id', openRegister.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'OPEN')
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      register: this.mapCashRegisterRow(data as CashRegisterRow),
      expectedBalance,
      closingBalance: normalizedClosingBalance,
      discrepancy,
    };
  }

  async addCashRegisterEntry(
    tenantId: string,
    planTier: PlanTier,
    type: CashRegisterMovementType,
    amount: number,
    description: string,
  ): Promise<void> {
    this.assertFinanceAccess(planTier);

    const openRegister = await this.findOpenCashRegister(tenantId);

    if (!openRegister) {
      throw new BadRequestException(
        'Abra o caixa antes de registrar suprimentos ou sangrias.',
      );
    }

    const normalizedAmount = this.roundCurrency(amount);
    const normalizedDescription = description.trim();

    if (normalizedAmount <= 0) {
      throw new BadRequestException('Informe um valor maior que zero.');
    }

    if (!normalizedDescription) {
      throw new BadRequestException('Informe uma descrição para o lançamento.');
    }

    const isSupply = type === 'SUPPLY';

    const { error } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .insert({
        tenant_id: tenantId,
        cash_register_id: openRegister.id,
        type: isSupply ? 'REVENUE' : 'EXPENSE',
        amount: normalizedAmount,
        description: normalizedDescription,
        category: isSupply ? 'CASH_SUPPLY' : 'CASH_BLEEDING',
        is_recurring: false,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async resolveOpenCashRegisterId(tenantId: string): Promise<string | null> {
    const openRegister = await this.findOpenCashRegister(tenantId);

    return openRegister?.id ?? null;
  }

  private async findOpenCashRegister(
    tenantId: string,
  ): Promise<CashRegisterRow | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('daily_cash_registers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'OPEN')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? (data as CashRegisterRow) : null;
  }

  private async calculatePeriodTotals(cashRegisterId: string): Promise<{
    revenue: number;
    expenses: number;
  }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .select('type, amount')
      .eq('cash_register_id', cashRegisterId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    let revenue = 0;
    let expenses = 0;

    for (const row of (data ?? []) as CashFlowPeriodRow[]) {
      const amount = Number(row.amount ?? 0);

      if (row.type === 'REVENUE') {
        revenue += amount;
        continue;
      }

      if (row.type === 'EXPENSE') {
        expenses += amount;
      }
    }

    return {
      revenue: this.roundCurrency(revenue),
      expenses: this.roundCurrency(expenses),
    };
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

  private mapCashRegisterRow(row: CashRegisterRow): DailyCashRegister {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      opened_by: row.opened_by,
      closed_by: row.closed_by,
      opening_balance: Number(row.opening_balance),
      closing_balance:
        row.closing_balance === null ? null : Number(row.closing_balance),
      status: row.status,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
    };
  }
}
