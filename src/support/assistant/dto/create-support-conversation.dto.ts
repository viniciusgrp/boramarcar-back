import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;
}
