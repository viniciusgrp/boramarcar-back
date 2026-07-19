import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EscalateSupportConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
