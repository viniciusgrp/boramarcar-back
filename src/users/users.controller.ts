import { Controller, Delete, UseGuards } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { resolveAuthUserId } from '../auth/utils/resolve-auth-user-id.util';
import type { DeleteUserResponse } from './entities/delete-user-response.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Delete('me')
  @UseGuards(AuthGuard)
  deleteMe(@CurrentUser() user: User): Promise<DeleteUserResponse> {
    return this.usersService.deleteAuthenticatedUser(resolveAuthUserId(user));
  }
}
