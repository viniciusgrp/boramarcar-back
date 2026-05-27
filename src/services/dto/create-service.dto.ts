export class CreateServiceDto {
  name!: string;
  description?: string;
  durationMinutes!: number;
  price!: number;
  isActive?: boolean;
}
