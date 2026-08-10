import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ServiceProductItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
