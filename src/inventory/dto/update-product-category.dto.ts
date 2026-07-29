import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
