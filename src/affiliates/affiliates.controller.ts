import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AffiliateGuard } from './affiliate.guard';
import { CurrentAffiliate } from './decorators/current-affiliate.decorator';
import {
  RegisterAffiliateDto,
  TrackAffiliateClickDto,
  UpdateAffiliateMeDto,
} from './dto/affiliate.dto';
import type { Affiliate } from './entities/affiliate.entity';
import { AffiliatesService } from './affiliates.service';
import { extractClientIp, extractUserAgent } from './utils/request-meta.util';

@Controller('affiliates')
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  @Post('register')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterAffiliateDto,
    @Req() request: Request,
  ) {
    return this.affiliatesService.register(dto, {
      ip: extractClientIp(request),
      userAgent: extractUserAgent(request),
    });
  }

  @Post('public/click')
  @Throttle({ medium: { limit: 40, ttl: 60_000 } })
  async trackClick(@Body() dto: TrackAffiliateClickDto): Promise<{ ok: true }> {
    await this.affiliatesService.trackClick(dto.code, dto.landing_path ?? '/');
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard, AffiliateGuard)
  getMe(@CurrentAffiliate() affiliate: Affiliate) {
    return this.affiliatesService.toPublicAffiliate(affiliate);
  }

  @Patch('me')
  @UseGuards(AuthGuard, AffiliateGuard)
  updateMe(
    @CurrentAffiliate() affiliate: Affiliate,
    @Body() dto: UpdateAffiliateMeDto,
  ) {
    return this.affiliatesService.updateMe(affiliate.id, dto);
  }

  @Get('me/stats')
  @UseGuards(AuthGuard, AffiliateGuard)
  getStats(@CurrentAffiliate() affiliate: Affiliate) {
    return this.affiliatesService.getStats(affiliate.id);
  }

  @Get('me/referrals')
  @UseGuards(AuthGuard, AffiliateGuard)
  listReferrals(@CurrentAffiliate() affiliate: Affiliate) {
    return this.affiliatesService.listReferrals(affiliate.id);
  }

  @Get('me/commissions')
  @UseGuards(AuthGuard, AffiliateGuard)
  listCommissions(@CurrentAffiliate() affiliate: Affiliate) {
    return this.affiliatesService.listCommissions(affiliate.id);
  }

  @Get('me/payouts')
  @UseGuards(AuthGuard, AffiliateGuard)
  listPayouts(@CurrentAffiliate() affiliate: Affiliate) {
    return this.affiliatesService.listPayouts(affiliate.id);
  }
}
