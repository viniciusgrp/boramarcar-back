import { IsUUID } from 'class-validator';

export class DismissSupportActionDto {
  @IsUUID()
  proposalId!: string;
}
