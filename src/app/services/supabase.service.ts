import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient, AuthError, PostgrestError, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService implements OnDestroy {
  client: SupabaseClient;
  private userSignal = signal<User | null>(null);
  user = computed(() => this.userSignal());
  private authListener: { unsubscribe: () => void } | null = null;

  constructor() {
        this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'wst-admin-auth',
      },
    });

    this.client.auth.getSession().then(({ data }) => {
      this.userSignal.set(data.session?.user ?? null);
    }).catch((err: any) => {
      console.warn('Initial getSession failed:', err?.message || err);
      this.userSignal.set(null);
    });

    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.userSignal.set(session?.user ?? null);
    });
    this.authListener = data.subscription;
  }

  ngOnDestroy() {
    this.authListener?.unsubscribe();
  }

  async getUser() {
    const { data, error } = await this.client.auth.getUser();
    if (error) {
      this.userSignal.set(null);
      return { data: { user: null }, error };
    }
    this.userSignal.set(data.user ?? null);
    return { data, error: null as AuthError | null };
  }

  async signInWithPassword(credentials: { email: string; password: string }) {
    const { data, error } = await this.client.auth.signInWithPassword(credentials);
    if (error) {
      return { data, error };
    }
    this.userSignal.set(data.user);
    return { data, error: null as AuthError | null };
  }

  async resetPasswordForEmail(email: string) {
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    this.userSignal.set(null);
    if (error) {
      throw error;
    }
  }

  async isAdmin(): Promise<boolean> {
    try {
      const { data, error } = await this.getUser();
      if (error || !data?.user) {
        return false;
      }
      const { data: owner, error: ownerError } = await this.client
        .from('owners')
        .select('is_admin')
        .eq('uuid', data.user.id)
        .maybeSingle();
      if (ownerError) {
        console.error('Error checking admin status:', (ownerError as PostgrestError).message);
        return false;
      }
      return !!owner?.is_admin;
    } catch {
      return false;
    }
  }

  async updateUser(updates: { password: string }) {
    const { data, error } = await this.client.auth.updateUser(updates);
    return { data, error };
  }
}