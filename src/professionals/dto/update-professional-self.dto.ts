import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProfessionalSelfDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
