import { inject, Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './services/supabase.service';

export const adminGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const isAdmin = await supabase.isAdmin();
  if (isAdmin) {
    return true;
  }
  try {
    await supabase.signOut();
  } catch {
    // already signed out
  }
  await router.navigate(['/login'], { queryParams: { reason: 'admin' } });
  return false;
};

@Injectable({ providedIn: 'root' })
export class AdminGuard {
  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    const isAdmin = await this.supabase.isAdmin();
    if (isAdmin) {
      return true;
    }
    try {
      await this.supabase.signOut();
    } catch {
      // already signed out
    }
    await this.router.navigate(['/login'], { queryParams: { reason: 'admin' } });
    return false;
  }
}