import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasHttpError, extractAsaasErrorMessage } from './asaas-http.error';
import type {
  AsaasAccount,
  AsaasCheckout,
  AsaasCustomer,
  AsaasListResponse,
  AsaasMyAccountStatus,
  AsaasPayment,
  AsaasSubscription,
  CreateAsaasAccountPayload,
} from './asaas.types';

@Injectable()
export class AsaasClient {
  private readonly logger = new Logger(AsaasClient.name);

  constructor(private readonly configService: ConfigService) {}

  async createCustomer(payload: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
    mobilePhone?: string;
    externalReference?: string;
  }): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>('POST', '/customers', payload);
  }

  async createSubscription(payload: {
    customer: string;
    billingType: 'UNDEFINED';
    value: number;
    nextDueDate: string;
    cycle: 'MONTHLY';
    description: string;
    externalReference: string;
  }): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('POST', '/subscriptions', payload);
  }

  async updateSubscription(
    subscriptionId: string,
    payload: {
      value?: number;
      description?: string;
      externalReference?: string;
      updatePendingPayments?: boolean;
    },
  ): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>(
      'PUT',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      payload,
    );
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  async listPayments(params: {
    subscription?: string;
    customer?: string;
    externalReference?: string;
    status?: string;
    limit?: number;
  }): Promise<AsaasListResponse<AsaasPayment>> {
    const search = new URLSearchParams();

    if (params.subscription) {
      search.set('subscription', params.subscription);
    }
    if (params.customer) {
      search.set('customer', params.customer);
    }
    if (params.externalReference) {
      search.set('externalReference', params.externalReference);
    }
    if (params.status) {
      search.set('status', params.status);
    }
    search.set('limit', String(params.limit ?? 10));

    return this.request<AsaasListResponse<AsaasPayment>>(
      'GET',
      `/payments?${search.toString()}`,
    );
  }

  async getPayment(paymentId: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    );
  }

  async refundPayment(paymentId: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/refund`,
    );
  }

  async createCheckout(payload: {
    billingTypes: Array<'PIX' | 'CREDIT_CARD'>;
    chargeTypes: Array<'DETACHED'>;
    minutesToExpire: number;
    callback: { successUrl: string; cancelUrl?: string };
    items: Array<{
      name: string;
      description?: string;
      quantity: number;
      value: number;
      imageBase64: string;
    }>;
    splits?: Array<{ walletId: string; percentageValue: number }>;
    externalReference: string;
    customer?: string;
  }): Promise<AsaasCheckout> {
    return this.request<AsaasCheckout>('POST', '/checkouts', payload);
  }

  async createAccount(
    payload: CreateAsaasAccountPayload,
  ): Promise<AsaasAccount> {
    return this.request<AsaasAccount>('POST', '/accounts', payload);
  }

  async getAccount(accountId: string): Promise<AsaasAccount> {
    return this.request<AsaasAccount>(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}`,
    );
  }

  /**
   * Subaccount onboarding status. `accessToken` is the subaccount apiKey and
   * must not be logged.
   */
  async getMyAccountStatus(accessToken: string): Promise<AsaasMyAccountStatus> {
    return this.request<AsaasMyAccountStatus>(
      'GET',
      '/myAccount/status',
      undefined,
      accessToken,
    );
  }

  private getBaseUrl(): string {
    const configured = this.configService.get<string>('ASAAS_API_URL')?.trim();
    const base = configured || 'https://api-sandbox.asaas.com/v3';

    return base.replace(/\/$/, '');
  }

  private getApiKey(): string {
    const key = this.configService.get<string>('ASAAS_API_KEY')?.trim();

    if (!key) {
      throw new InternalServerErrorException('ASAAS_API_KEY is not configured');
    }

    return key;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const token = accessToken?.trim() || this.getApiKey();

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          access_token: token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.error(`Asaas ${method} ${path} timed out`);
        throw new InternalServerErrorException(
          'O Asaas não respondeu a tempo. Tente novamente.',
        );
      }

      this.logger.error(
        `Asaas ${method} ${path} network error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new InternalServerErrorException(
        'Não foi possível conectar ao Asaas.',
      );
    }

    const text = await response.text();
    let parsed: unknown = null;

    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      const message = extractAsaasErrorMessage(parsed);
      throw new AsaasHttpError(response.status, parsed as never, message);
    }

    return parsed as T;
  }
}
