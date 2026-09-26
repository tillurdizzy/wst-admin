import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FluidModule } from 'primeng/fluid';
import { SupabaseService } from '../../services/supabase.service';

const TEMP_PASSWORD = '123456';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    InputTextModule,
    ButtonModule,
    PasswordModule,
    ToastModule,
    FloatLabelModule,
    FluidModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  providers: [MessageService],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private supabaseService: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  async ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'admin') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Admin only',
        detail: 'This dashboard is limited to administrators.',
      });
    }

    try {
      const { data } = await this.supabaseService.getUser();
      if (data?.user) {
        const isAdmin = await this.supabaseService.isAdmin();
        if (isAdmin) {
          this.router.navigate(['/owners']);
        }
      }
    } catch {
      // stay on login
    }
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    const { email, password } = this.loginForm.value;

    try {
      const { data } = await this.supabaseService.signInWithPassword({ email, password });
      if (!data?.user) {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Sign in failed' });
        return;
      }

      const isAdmin = await this.supabaseService.isAdmin();
      this.loading = false;

      if (!isAdmin) {
        await this.supabaseService.signOut().catch(() => undefined);
        this.messageService.add({
          severity: 'error',
          summary: 'Not authorized',
          detail: 'This dashboard is for administrators only.',
        });
        return;
      }

      if (password === TEMP_PASSWORD) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Temporary password',
          detail: 'Change this password in the owners portal before continuing long-term.',
        });
      }

      this.router.navigate(['/owners']);
    } catch (error) {
      this.loading = false;
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: (error as Error).message ?? 'An unknown error occurred',
      });
    }
  }

  async resetPassword() {
    const email = this.loginForm.get('email')?.value;
    if (!email || this.loginForm.get('email')?.hasError('email')) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please enter a valid email first',
      });
      return;
    }

    try {
      await this.supabaseService.resetPasswordForEmail(email);
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Check your email for a password reset link.',
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: (error as Error).message ?? 'An unknown error occurred',
      });
    }
  }
}