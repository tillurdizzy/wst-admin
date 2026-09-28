import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { SupabaseService } from '../../../services/supabase.service';
import { OwnerRow, OwnerPanelMode } from '../owner-row';

const TEMP_PASSWORD = '123456';


@Component({
  selector: 'app-owner-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, ButtonModule, CheckboxModule],
  templateUrl: './owner-panel.component.html',
  styleUrl: './owner-panel.component.scss',
})
export class OwnerPanelComponent implements OnChanges {
  @Input() mode: OwnerPanelMode = 'edit';
  @Input() owner: OwnerRow | null = null;
  @Output() saved = new EventEmitter<number | null>();
  @Output() deleted = new EventEmitter<void>();

  firstname = '';
  lastname = '';
  street = '';
  csz = '';
  cell = '';
  email = '';
  isAdmin = false;
  dataConfirmed = false;
  unitList: { unit: number; owner_occupied: boolean }[] = [];
  uuid: string | null = null;
  ownerId: number | null = null;

  assignUnit = '';
  currentUnitOwner = '';
  lookingUpUnit = false;

  savingOwner = false;
  savingAuth = false;
  savingAdmin = false;
  assigning = false;
  message = '';
  error = '';

  private snapshot = '';

  constructor(private supabase: SupabaseService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['owner'] || changes['mode']) {
      this.hydrate();
    }
  }

  get title(): string {
    return this.mode === 'new' ? 'New Owner' : 'Selected Owner';
  }

  get ownerDirty(): boolean {
    return this.snapshot !== this.ownerSnapshot();
  }

  get canSaveOwner(): boolean {
    return this.ownerDirty && !!this.firstname.trim() && !this.savingOwner;
  }

  get canCreate(): boolean {
    return !!this.firstname.trim() && !!this.assignUnit.trim() && !this.savingOwner;
  }

  get canDelete(): boolean {
    return this.mode === 'edit' && !!this.ownerId && this.unitList.length === 0;
  }

  private ownerSnapshot(): string {
    return JSON.stringify({
      firstname: this.firstname,
      lastname: this.lastname,
      street: this.street,
      csz: this.csz,
      cell: this.cell,
    });
  }

  private hydrate() {
    this.message = '';
    this.error = '';
    this.assignUnit = '';
    this.currentUnitOwner = '';
    if (this.mode === 'new' || !this.owner) {
      this.ownerId = null;
      this.firstname = '';
      this.lastname = '';
      this.street = '';
      this.csz = '';
      this.cell = '';
      this.email = '';
      this.isAdmin = false;
      this.dataConfirmed = false;
      this.unitList = [];
      this.uuid = null;
      this.snapshot = this.ownerSnapshot();
      return;
    }
    this.ownerId = this.owner.owner_id;
    this.firstname = this.owner.firstname ?? '';
    this.lastname = this.owner.lastname ?? '';
    this.street = this.owner.street ?? '';
    this.csz = this.owner.csz ?? '';
    this.cell = this.owner.cell ?? '';
    this.email = this.owner.email ?? '';
    this.isAdmin = !!this.owner.is_admin;
    this.dataConfirmed = !!this.owner.data_confirmed;
    this.unitList = [...(this.owner.unitList ?? [])];
    this.uuid = this.owner.uuid;
    this.snapshot = this.ownerSnapshot();
  }

  async saveOwner() {
    if (!this.firstname.trim()) {
      this.error = 'First name is required.';
      return;
    }
    this.savingOwner = true;
    this.error = '';
    const patch = {
      firstname: this.firstname.trim(),
      lastname: this.lastname.trim() || null,
      street: this.street.trim() || null,
      csz: this.csz.trim() || null,
      cell: this.cell.trim() || null,
      updated_by: this.supabase.user()?.email ?? null,
    };

    if (this.mode === 'new') {
      const unit = Number(this.assignUnit);
      if (!unit) {
        this.savingOwner = false;
        this.error = 'Unit is required.';
        return;
      }
      const { data, error } = await this.supabase.client
        .from('owners')
        .insert(patch)
        .select('owner_id')
        .single();
      this.savingOwner = false;
      if (error || !data) {
        this.error = error?.message ?? 'Could not create owner.';
        return;
      }
      const assigned = await this.updateUnitOwner(unit, data.owner_id);
      if (!assigned) return;
      this.message = `Owner created and unit ${unit} assigned.`;
      this.saved.emit(data.owner_id);
      return;
    }

    if (!this.ownerId) {
      this.savingOwner = false;
      return;
    }
    const { error } = await this.supabase.client
      .from('owners')
      .update(patch)
      .eq('owner_id', this.ownerId);
    this.savingOwner = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.snapshot = this.ownerSnapshot();
    this.message = 'Owner saved.';
    this.saved.emit(this.ownerId);
  }

    async saveNewOwner() {
    if (!this.firstname.trim()) {
      this.error = 'First name is required.';
      return;
    }
    const unit = Number(this.assignUnit);
    if (!unit) {
      this.error = 'Unit is required.';
      return;
    }
    this.savingOwner = true;
    this.error = '';
    const email = this.email.trim();
    const { data, error } = await this.supabase.client
      .from('owners')
      .insert({
        firstname: this.firstname.trim(),
        lastname: this.lastname.trim() || null,
        street: this.street.trim() || null,
        csz: this.csz.trim() || null,
        cell: this.cell.trim() || null,
        email: email || null,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .select('owner_id')
      .single();
    if (error || !data) {
      this.savingOwner = false;
      this.error = error?.message ?? 'Could not create owner.';
      return;
    }
    const assigned = await this.updateUnitOwner(unit, data.owner_id);
    if (!assigned) {
      this.savingOwner = false;
      return;
    }
    if (email) {
      try {
        const uuid = await this.signUpOwner(email);
        await this.supabase.client
          .from('owners')
          .update({ uuid })
          .eq('owner_id', data.owner_id);
        this.message = `Owner created, unit ${unit} assigned, login created. Temp password ${TEMP_PASSWORD}.`;
      } catch {
        this.message = `Owner created and unit ${unit} assigned. Auth login was not created.`;
      }
    } else {
      this.message = `Owner created and unit ${unit} assigned.`;
    }
    this.savingOwner = false;
    this.saved.emit(data.owner_id);
  }

  async toggleOccupied(unit: number, occupied: boolean) {
    const { error } = await this.supabase.client
      .from('units')
      .update({ owner_occupied: occupied })
      .eq('unit', unit);
    if (error) {
      this.error = error.message;
    }
  }

  async onAssignUnitChange() {
    this.currentUnitOwner = '';
    const unit = Number(this.assignUnit);
    if (!unit) return;
    this.lookingUpUnit = true;
    const { data, error } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id')
      .eq('unit', unit)
      .maybeSingle();
    if (error || !data) {
      this.lookingUpUnit = false;
      this.currentUnitOwner = error ? error.message : 'Unit not found in unit_owners.';
      return;
    }
    const { data: owner } = await this.supabase.client
      .from('owners')
      .select('owner_id, firstname, lastname')
      .eq('owner_id', data.owner_id)
      .maybeSingle();
    this.lookingUpUnit = false;
    if (!owner) {
      this.currentUnitOwner = `Unit ${unit} is linked to owner ${data.owner_id}.`;
      return;
    }
    this.currentUnitOwner = `Currently ${owner.firstname ?? ''} ${owner.lastname ?? ''}`.trim();
  }

  async assignUnitToOwner() {
    if (!this.ownerId) {
      this.error = 'Save the new owner first, or pick an existing owner.';
      return;
    }
    const unit = Number(this.assignUnit);
    if (!unit) {
      this.error = 'Enter a unit number.';
      return;
    }
    this.assigning = true;
    const ok = await this.updateUnitOwner(unit, this.ownerId);
    this.assigning = false;
    if (!ok) return;
    if (!this.unitList.some((u) => u.unit === unit)) {
      this.unitList = [...this.unitList, { unit, owner_occupied: false }].sort((a, b) => a.unit - b.unit);
    }
    this.message = `Unit ${unit} assigned.`;
    this.assignUnit = '';
    this.currentUnitOwner = '';
    this.saved.emit(this.ownerId);
  }

  private async updateUnitOwner(unit: number, ownerId: number): Promise<boolean> {
    const { data: existing, error: findError } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id')
      .eq('unit', unit)
      .maybeSingle();
    if (findError) {
      this.error = findError.message;
      return false;
    }
    if (!existing) {
      this.error = 'That unit is not in unit_owners. No new link row will be inserted.';
      return false;
    }
    const { error } = await this.supabase.client
      .from('unit_owners')
      .update({ owner_id: ownerId })
      .eq('unit', unit);
    if (error) {
      this.error = error.message;
      return false;
    }
    return true;
  }

  async saveEmailAndAuth() {
    if (!this.ownerId) {
      this.error = 'Save the owner record first.';
      return;
    }
    const email = this.email.trim();
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    const adminSession = sessionData.session;
    if (!adminSession) {
      this.error = 'Admin session not found.';
      return;
    }

    this.savingAuth = true;
    this.error = '';
    try {
      let uuid = this.uuid;
      const createdAuth = !!(email && !uuid);
      if (createdAuth) {
        uuid = await this.signUpOwner(email);
      }
      const { error } = await this.supabase.client
        .from('owners')
        .update({ email: email || null, uuid })
        .eq('owner_id', this.ownerId);
      if (error) throw new Error(error.message);
      this.uuid = uuid;
      this.message = createdAuth
        ? `Login created. Temp password ${TEMP_PASSWORD}.`
        : uuid
          ? 'Email saved. Existing Auth login was not changed.'
          : 'Email cleared.';
      this.saved.emit(this.ownerId);
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.savingAuth = false;
      await this.supabase.client.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }
  }

    async saveAdmin() {
    if (!this.ownerId) {
      this.error = 'Save the owner record first.';
      return;
    }
    this.savingAdmin = true;
    const { error } = await this.supabase.client
      .from('owners')
      .update({
        is_admin: this.isAdmin,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('owner_id', this.ownerId);
    this.savingAdmin = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.message = this.isAdmin ? 'Admin access on.' : 'Admin access off.';
    this.saved.emit(this.ownerId);
  }

  async saveConfirmed() {
    if (!this.ownerId) {
      this.error = 'Save the owner record first.';
      return;
    }
    const { error } = await this.supabase.client
      .from('owners')
      .update({
        data_confirmed: this.dataConfirmed,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('owner_id', this.ownerId);
    if (error) {
      this.error = error.message;
      return;
    }
    this.message = this.dataConfirmed ? 'Data confirmed.' : 'Data unconfirmed.';
    this.saved.emit(this.ownerId);
  }

    async deleteOwner() {
    if (!this.ownerId || !this.canDelete) {
      this.error = 'Only owners with no units can be deleted.';
      return;
    }
    const { count, error: linkError } = await this.supabase.client
      .from('unit_owners')
      .select('unit', { count: 'exact', head: true })
      .eq('owner_id', this.ownerId);
    if (linkError) {
      this.error = linkError.message;
      return;
    }
    if ((count ?? 0) > 0) {
      this.error = 'This owner still has a unit. Reassign the unit first.';
      return;
    }

    this.error = '';
    let authNote = '';
    if (this.uuid) {
      const { error: authError } = await this.supabase.client.auth.admin.deleteUser(this.uuid);
      if (authError) {
        authNote = ' Auth login could not be deleted from this app (needs service role). Remove it in the Supabase dashboard.';
      } else {
        authNote = ' Auth login deleted.';
      }
    }

    const { error } = await this.supabase.client
      .from('owners')
      .delete()
      .eq('owner_id', this.ownerId);
    if (error) {
      this.error = error.message + authNote;
      return;
    }
    this.message = 'Owner deleted.' + authNote;
    this.deleted.emit();
  }

  private async signUpOwner(email: string): Promise<string> {
    const tempClient = createClient(environment.supabaseUrl, environment.supabaseKey);
    const { data, error } = await tempClient.auth.signUp({
      email,
      password: TEMP_PASSWORD,
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to create login');
    }
    return data.user.id;
  }
}