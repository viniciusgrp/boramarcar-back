import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class EmailFunnelTutorialStepDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(1000)
  body!: string;
}

export class UpdateEmailFunnelStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body_if_setup?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailFunnelTutorialStepDto)
  steps_json?: EmailFunnelTutorialStepDto[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cta_label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cta_path?: string;

  @IsOptional()
  @IsIn([
    'immediate',
    'hours_after_signup',
    'days_after_signup',
    'days_before_trial_end',
  ])
  trigger_type?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  trigger_offset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  send_hour?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  window_start_hour?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  window_end_hour?: number | null;

  @IsOptional()
  @IsBoolean()
  skip_if_setup_complete?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  image_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  video_url?: string | null;
}

export class SendEmailFunnelPreviewDto {
  @IsString()
  step_key!: string;

  @IsEmail()
  to!: string;
}
