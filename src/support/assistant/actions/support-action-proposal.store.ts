import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  SupportActionPayload,
  SupportActionType,
  SupportParsedActionPropose,
} from './support-action.types';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;

export interface StoredSupportActionProposal {
  id: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  type: SupportActionType;
  payload: SupportActionPayload;
  /** Resolved ids after preview (authoritative for execute). */
  resolvedProfessionalId?: string;
  resolvedAppointmentId?: string;
  resolvedAbsenceId?: string;
  cancelConflicting: boolean;
  conflictCount: number;
  expiresAt: number;
}

@Injectable()
export class SupportActionProposalStore {
  private readonly proposals = new Map<string, StoredSupportActionProposal>();

  create(params: {
    tenantId: string;
    userId: string;
    conversationId: string;
    action: SupportParsedActionPropose;
    resolvedProfessionalId?: string;
    resolvedAppointmentId?: string;
    resolvedAbsenceId?: string;
    cancelConflicting?: boolean;
    conflictCount?: number;
  }): StoredSupportActionProposal {
    this.pruneExpired();

    const proposal: StoredSupportActionProposal = {
      id: randomUUID(),
      tenantId: params.tenantId,
      userId: params.userId,
      conversationId: params.conversationId,
      type: params.action.type,
      payload: params.action.payload,
      resolvedProfessionalId: params.resolvedProfessionalId,
      resolvedAppointmentId: params.resolvedAppointmentId,
      resolvedAbsenceId: params.resolvedAbsenceId,
      cancelConflicting: params.cancelConflicting ?? false,
      conflictCount: params.conflictCount ?? 0,
      expiresAt: Date.now() + PROPOSAL_TTL_MS,
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  getForUser(params: {
    proposalId: string;
    tenantId: string;
    userId: string;
  }): StoredSupportActionProposal | null {
    this.pruneExpired();
    const proposal = this.proposals.get(params.proposalId);
    if (!proposal) {
      return null;
    }
    if (
      proposal.tenantId !== params.tenantId ||
      proposal.userId !== params.userId
    ) {
      return null;
    }
    if (proposal.expiresAt < Date.now()) {
      this.proposals.delete(params.proposalId);
      return null;
    }
    return proposal;
  }

  delete(proposalId: string): void {
    this.proposals.delete(proposalId);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, proposal] of this.proposals.entries()) {
      if (proposal.expiresAt < now) {
        this.proposals.delete(id);
      }
    }
  }
}
