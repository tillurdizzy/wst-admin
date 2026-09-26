import { inject, Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  try {
    const { data, error } = await supabaseService.getUser();
    if (!error && data?.user) {
      return true;
    }
  } catch {
    // not signed in
  }

  await router.navigate(['/login']);
  return false;
};

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.getUser();
      if (!error && data?.user) {
        return true;
      }
    } catch {
      // not signed in
    }
    await this.router.navigate(['/login']);
    return false;
  }
}