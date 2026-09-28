import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { SupabaseService } from '../../../services/supabase.service';
import { ParkingRow } from '../parking-row';

@Component({
  selector: 'app-parking-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, CheckboxModule],
  templateUrl: './parking-panel.component.html',
  styleUrl: './parking-panel.component.scss',
})
export class ParkingPanelComponent {
  @Input() spaceRow: ParkingRow | null = null;
  @Output() changed = new EventEmitter<void>();

  ownerDialog = false;
  vehicleDialog = false;
  assignDialog = false;
  swapDialog = false;
  saving = false;
  message = '';
  error = '';

  ownerName = '';
  vehicleForm = { make: '', model: '', color: '', tag: '', dataConfirmed: false };
  assignUnit = '';
  swapSpace = '';
  swapHint = '';

  constructor(private supabase: SupabaseService) {}

  get isRegistered(): boolean {
    return Number(this.spaceRow?.space) >= 600;
  }

  private blankToNull(value: string | null | undefined): string | null {
    const text = (value ?? '').trim();
    if (!text || text === '-' || text === '—' || text === '–') return null;
    return text;
  }

  openOwnerDialog() {
    this.ownerName = this.spaceRow?.name ?? '';
    this.error = '';
    this.ownerDialog = true;
  }

  openVehicleDialog() {
    this.vehicleForm = {
      make: this.spaceRow?.make ?? '',
      model: this.spaceRow?.model ?? '',
      color: this.spaceRow?.color ?? '',
      tag: this.spaceRow?.tag ?? '',
      dataConfirmed: !!this.spaceRow?.data_confirmed,
    };
    this.error = '';
    this.vehicleDialog = true;
  }

  openAssignDialog() {
    this.assignUnit = this.spaceRow?.unit ? String(this.spaceRow.unit) : '';
    this.error = '';
    this.assignDialog = true;
  }

  openSwapDialog() {
    this.swapSpace = '';
    this.swapHint = '';
    this.error = '';
    this.swapDialog = true;
  }

  async onSwapSpaceChange() {
    const space = Number(this.swapSpace);
    if (!space) {
      this.swapHint = '';
      return;
    }
    const { data } = await this.supabase.client
      .from('parking')
      .select('space, unit, name, tag')
      .eq('space', space)
      .maybeSingle();
    if (!data) {
      this.swapHint = 'That space ID was not found.';
      return;
    }
    this.swapHint = `Space ${data.space} is assigned to unit ${data.unit ?? 'none'}${data.name ? ', ' + data.name : ''}${data.tag ? ', ' + data.tag : ''}.`;
  }

  async saveOwner() {
    if (!this.spaceRow) return;
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('parking')
      .update({
        name: this.blankToNull(this.ownerName),
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('space', this.spaceRow.space);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.ownerDialog = false;
    this.changed.emit();
  }

  async saveVehicle() {
    if (!this.spaceRow) return;
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('parking')
      .update({
        make: this.blankToNull(this.vehicleForm.make),
        model: this.blankToNull(this.vehicleForm.model),
        color: this.blankToNull(this.vehicleForm.color),
        tag: this.blankToNull(this.vehicleForm.tag),
        data_confirmed: this.vehicleForm.dataConfirmed,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('space', this.spaceRow.space);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.vehicleDialog = false;
    this.changed.emit();
  }

  async clearVehicle() {
    if (!this.spaceRow) return;
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('parking')
      .update({
        make: null,
        model: null,
        color: null,
        tag: null,
        name: null,
        data_confirmed: false,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('space', this.spaceRow.space);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.vehicleDialog = false;
    this.changed.emit();
  }

  async assignRegistered() {
    if (!this.spaceRow) return;
    const unit = Number(this.assignUnit);
    if (!unit) {
      this.error = 'Enter a unit number.';
      return;
    }
    this.saving = true;
    this.error = '';
    const { error } = await this.supabase.client
      .from('parking')
      .update({
        unit,
        updated_by: this.supabase.user()?.email ?? null,
      })
      .eq('space', this.spaceRow.space);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.assignDialog = false;
    this.message = `Space ${this.spaceRow.space} assigned to unit ${unit}.`;
    this.changed.emit();
  }

  async swapSpaces() {
    if (!this.spaceRow) return;
    const otherSpace = Number(this.swapSpace);
    if (!otherSpace || otherSpace === this.spaceRow.space) {
      this.error = 'Enter a different Space ID.';
      return;
    }
    this.saving = true;
    this.error = '';
    const { data: other, error: findError } = await this.supabase.client
      .from('parking')
      .select('space, unit')
      .eq('space', otherSpace)
      .maybeSingle();
    if (findError || !other) {
      this.saving = false;
      this.error = findError?.message || 'That space ID was not found.';
      return;
    }
    const unitA = this.spaceRow.unit;
    const unitB = other.unit;
    const first = await this.supabase.client
      .from('parking')
      .update({ unit: unitB, updated_by: this.supabase.user()?.email ?? null })
      .eq('space', this.spaceRow.space);
    if (first.error) {
      this.saving = false;
      this.error = first.error.message;
      return;
    }
    const second = await this.supabase.client
      .from('parking')
      .update({ unit: unitA, updated_by: this.supabase.user()?.email ?? null })
      .eq('space', other.space);
    this.saving = false;
    if (second.error) {
      this.error = second.error.message;
      return;
    }
    this.swapDialog = false;
    this.message = `Swapped units between space ${this.spaceRow.space} and space ${other.space}.`;
    this.changed.emit();
  }
}