import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateSupportRequestDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
