import { IsUUID } from 'class-validator';

export class LinkOwnerProfessionalDto {
  @IsUUID()
  professionalId!: string;
}
