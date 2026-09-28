import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { SupabaseService } from '../../../services/supabase.service';
import { DotStatus, UnitResident, UnitRow, UnitVehicle } from '../unit-row';

const TEMP_PASSWORD = '123456';

@Component({
  selector: 'app-unit-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, CheckboxModule],
  templateUrl: './unit-panel.component.html',
  styleUrl: './unit-panel.component.scss',
})
export class UnitPanelComponent implements OnChanges {
  @Input() unitRow: UnitRow | null = null;
  @Output() changed = new EventEmitter<void>();

  residents: UnitResident[] = [];
  vehicles: UnitVehicle[] = [];
  residentsStatus: DotStatus = 'red';
  vehiclesStatus: DotStatus = 'red';
  message = '';
  error = '';
  sqft: string | number | null = null;
  legal: string | number | null = null;

  ownerDialog = false;
  editOwnerDialog = false;
  residentDialog = false;
  vehicleDialog = false;
  saving = false;
  editingResidentId: number | null = null;
  editingVehicleId: number | null = null;

  ownerForm = {
    firstname: '',
    lastname: '',
    email: '',
    cell: '',
    street: '',
    csz: '',
    ownerOccupied: true,
    dataConfirmed: true,
  };

  residentForm = {
    firstname: '',
    lastname: '',
    cell: '',
    email: '',
    dataConfirmed: false,
  };

  vehicleForm = {
    make: '',
    model: '',
    color: '',
    tag: '',
    dataConfirmed: false,
  };

  constructor(private supabase: SupabaseService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['unitRow'] && this.unitRow) {
      void this.loadDetails(this.unitRow.unit);
    }
  }

  get ownerConfirmed(): boolean {
    return !!this.unitRow?.owner?.data_confirmed;
  }

  get ownerHasAuth(): boolean {
    return !!this.unitRow?.owner?.uuid;
  }

  get residentLabel(): string {
    return this.unitRow?.owner_occupied ? 'Residents' : 'Tenants';
  }

  get addPeopleLabel(): string {
    return this.unitRow?.owner_occupied ? 'Add Resident' : 'Add Tenant';
  }

  private blankToNull(value: string | null | undefined): string | null {
    const text = (value ?? '').trim();
    if (!text || text === '-' || text === '—' || text === '–') return null;
    return text;
  }

  async loadDetails(unit: number) {
    this.message = '';
    this.error = '';
    this.sqft = null;
    this.legal = null;

    const { data: resData } = await this.supabase.client
      .from('residents')
      .select('id, firstname, lastname, cell, email, data_confirmed')
      .eq('unit', unit);
    this.residents = (resData ?? []) as UnitResident[];

    const { data: vehData } = await this.supabase.client
      .from('parking')
      .select('id, make, model, color, tag, data_confirmed')
      .eq('unit', unit);
    this.vehicles = ((vehData ?? []) as UnitVehicle[]).filter((v) => !!(v.make || v.model || v.tag));

    this.residentsStatus = this.residentsSectionStatus();
    this.vehiclesStatus = this.statusFromFlags(this.vehicles.map((v) => !!v.data_confirmed));
  }

  openOwnerDialog() {
    const owner = this.unitRow?.owner;
    this.ownerForm = {
      firstname: '',
      lastname: '',
      email: '',
      cell: '',
      street: owner?.street ?? '',
      csz: owner?.csz ?? '',
      ownerOccupied: !!this.unitRow?.owner_occupied,
      dataConfirmed: true,
    };
    this.error = '';
    this.ownerDialog = true;
  }

  openEditOwnerDialog() {
    const owner = this.unitRow?.owner;
    if (!owner) return;
    this.ownerForm = {
      firstname: owner.firstname ?? '',
      lastname: owner.lastname ?? '',
      email: owner.email ?? '',
      cell: owner.cell ?? '',
      street: owner.street ?? '',
      csz: owner.csz ?? '',
      ownerOccupied: !!this.unitRow?.owner_occupied,
      dataConfirmed: !!owner.data_confirmed,
    };
    this.error = '';
    this.editOwnerDialog = true;
  }

  openResidentDialog() {
    this.editingResidentId = null;
    this.residentForm = { firstname: '', lastname: '', cell: '', email: '', dataConfirmed: false };
    this.error = '';
    this.residentDialog = true;
  }

  openEditResident(row: UnitResident) {
    this.editingResidentId = row.id;
    this.residentForm = {
      firstname: row.firstname ?? '',
      lastname: row.lastname ?? '',
      cell: row.cell ?? '',
      email: row.email ?? '',
      dataConfirmed: !!row.data_confirmed,
    };
    this.error = '';
    this.residentDialog = true;
  }

  openVehicleDialog() {
    this.editingVehicleId = null;
    this.vehicleForm = { make: '', model: '', color: '', tag: '', dataConfirmed: false };
    this.error = '';
    this.vehicleDialog = true;
  }

  openEditVehicle(row: UnitVehicle) {
    this.editingVehicleId = row.id;
    this.vehicleForm = {
      make: row.make ?? '',
      model: row.model ?? '',
      color: row.color ?? '',
      tag: row.tag ?? '',
      dataConfirmed: !!row.data_confirmed,
    };
    this.error = '';
    this.vehicleDialog = true;
  }

  async saveOwnerEdits() {
    const unit = this.unitRow?.unit;
    const ownerId = this.unitRow?.owner?.owner_id;
    if (!unit || !ownerId) return;
    const firstname = this.blankToNull(this.ownerForm.firstname);
    if (!firstname) {
      this.error = 'First name is required.';
      return;
    }
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('owners')
      .update({
        firstname,
        lastname: this.blankToNull(this.ownerForm.lastname),
        cell: this.blankToNull(this.ownerForm.cell),
        street: this.blankToNull(this.ownerForm.street),
        csz: this.blankToNull(this.ownerForm.csz),
        data_confirmed: this.ownerForm.dataConfirmed,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('owner_id', ownerId);
    if (error) {
      this.saving = false;
      this.error = error.message;
      return;
    }
    await this.supabase.client
      .from('units')
      .update({ owner_occupied: this.ownerForm.ownerOccupied })
      .eq('unit', unit);
    this.saving = false;
    this.editOwnerDialog = false;
    this.changed.emit();
    await this.loadDetails(unit);
  }

  async saveNewOwner() {
    const unit = this.unitRow?.unit;
    if (!unit) return;
    const firstname = this.blankToNull(this.ownerForm.firstname);
    if (!firstname) {
      this.error = 'First name is required.';
      return;
    }
    this.saving = true;
    this.error = '';
    const email = this.blankToNull(this.ownerForm.email);
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    const adminSession = sessionData.session;
    try {
      let uuid: string | null = null;
      if (email) {
        uuid = await this.signUpOwner(email);
      }
      const { data, error } = await this.supabase.client
        .from('owners')
        .insert({
          firstname,
          lastname: this.blankToNull(this.ownerForm.lastname),
          email,
          cell: this.blankToNull(this.ownerForm.cell),
          street: this.blankToNull(this.ownerForm.street),
          csz: this.blankToNull(this.ownerForm.csz),
          uuid,
          data_confirmed: this.ownerForm.dataConfirmed,
          updated_by: this.supabase.user()?.email ?? null,
        })
        .select('owner_id')
        .single();
      if (error || !data) throw new Error(error?.message || 'Could not create owner.');

      const { data: existing } = await this.supabase.client
        .from('unit_owners')
        .select('unit')
        .eq('unit', unit)
        .maybeSingle();
      if (!existing) throw new Error('That unit is not in unit_owners.');
      const { error: assignError } = await this.supabase.client
        .from('unit_owners')
        .update({ owner_id: data.owner_id })
        .eq('unit', unit);
      if (assignError) throw new Error(assignError.message);

      await this.supabase.client
        .from('units')
        .update({ owner_occupied: this.ownerForm.ownerOccupied })
        .eq('unit', unit);

      this.ownerDialog = false;
      this.message = email
        ? `Owner created. Temp password ${TEMP_PASSWORD}.`
        : 'Owner created. No Auth login until an email is added.';
      this.changed.emit();
      await this.loadDetails(unit);
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.saving = false;
      if (adminSession) {
        await this.supabase.client.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }
    }
  }

  async saveResident() {
    const unit = this.unitRow?.unit;
    if (!unit) return;
    const firstname = this.blankToNull(this.residentForm.firstname);
    if (!firstname) {
      this.error = 'First name is required.';
      return;
    }
    this.saving = true;
    this.error = '';
    const payload = {
      firstname,
      lastname: this.blankToNull(this.residentForm.lastname),
      cell: this.blankToNull(this.residentForm.cell),
      email: this.blankToNull(this.residentForm.email),
      unit,
      data_confirmed: this.residentForm.dataConfirmed,
      updated_by: this.supabase.user()?.email ?? null,
    };
    const { error } = this.editingResidentId
      ? await this.supabase.client.from('residents').update(payload).eq('id', this.editingResidentId)
      : await this.supabase.client.from('residents').insert(payload);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.residentDialog = false;
    await this.loadDetails(unit);
  }

  async deleteResident() {
    if (!this.editingResidentId || !this.unitRow) return;
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('residents')
      .delete()
      .eq('id', this.editingResidentId);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.residentDialog = false;
    this.editingResidentId = null;
    await this.loadDetails(this.unitRow.unit);
  }

  async saveVehicle() {
    const unit = this.unitRow?.unit;
    if (!unit) return;
    const make = this.blankToNull(this.vehicleForm.make);
    const model = this.blankToNull(this.vehicleForm.model);
    const tag = this.blankToNull(this.vehicleForm.tag);
    if (!make || !model || !tag) {
      this.error = 'Make, model, and license are required.';
      return;
    }
    this.saving = true;
    this.error = '';
    const payload = {
      make,
      model,
      color: this.blankToNull(this.vehicleForm.color),
      tag,
      unit,
      data_confirmed: this.vehicleForm.dataConfirmed,
      updated_by: this.supabase.user()?.email ?? null,
    };
    const { error } = this.editingVehicleId
      ? await this.supabase.client.from('parking').update(payload).eq('id', this.editingVehicleId)
      : await this.supabase.client.from('parking').insert(payload);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.vehicleDialog = false;
    await this.loadDetails(unit);
  }

  async deleteVehicle() {
    if (!this.editingVehicleId || !this.unitRow) return;
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('parking')
      .update({
        make: null,
        model: null,
        color: null,
        tag: null,
        data_confirmed: false,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('id', this.editingVehicleId);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.vehicleDialog = false;
    this.editingVehicleId = null;
    await this.loadDetails(this.unitRow.unit);
  }

  private async signUpOwner(email: string): Promise<string> {
    const tempClient = createClient(environment.supabaseUrl, environment.supabaseKey);
    const { data, error } = await tempClient.auth.signUp({ email, password: TEMP_PASSWORD });
    if (error || !data.user) throw new Error(error?.message || 'Failed to create login');
    return data.user.id;
  }

  private residentsSectionStatus(): DotStatus {
    const flags: boolean[] = this.residents.map((r) => !!r.data_confirmed);
    if (this.unitRow?.owner_occupied) {
      flags.unshift(this.ownerConfirmed);
    }
    return this.statusFromFlags(flags);
  }

  private statusFromFlags(flags: boolean[]): DotStatus {
    if (!flags.length) return 'red';
    const confirmed = flags.filter((f) => f).length;
    if (confirmed === flags.length) return 'green';
    if (flags.length > 1 && confirmed > 0 && confirmed < flags.length) return 'yellow';
    return 'red';
  }
}