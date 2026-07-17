import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ExecuteSupportActionDto {
  @IsUUID()
  proposalId!: string;

  @IsOptional()
  @IsBoolean()
  confirmCancelConflicting?: boolean;
}
