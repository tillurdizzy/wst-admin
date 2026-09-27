import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../../services/supabase.service';
import { DotStatus, UnitResident, UnitRow, UnitVehicle } from '../unit-row';

@Component({
  selector: 'app-unit-panel',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './unit-panel.component.html',
  styleUrl: './unit-panel.component.scss',
})
export class UnitPanelComponent implements OnChanges {
  @Input() unitRow: UnitRow | null = null;

  residents: UnitResident[] = [];
  vehicles: UnitVehicle[] = [];
  residentsStatus: DotStatus = 'red';
  vehiclesStatus: DotStatus = 'red';
  message = '';
  street = '';
  csz = '';
  sqft: string | number | null = null;
  legal: string | number | null = null;

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

  async loadDetails(unit: number) {
    this.message = '';
    
    const { data: resData } = await this.supabase.client
      .from('residents')
      .select('id, firstname, lastname, cell, email, data_confirmed')
      .eq('unit', unit);
    this.residents = (resData ?? []) as UnitResident[];

    const { data: vehData } = await this.supabase.client
      .from('parking')
      .select('id, make, model, color, tag, data_confirmed')
      .eq('unit', unit);
    this.vehicles = (vehData ?? []) as UnitVehicle[];

    this.residentsStatus = this.residentsSectionStatus();
    this.vehiclesStatus = this.statusFromFlags(this.vehicles.map((v) => !!v.data_confirmed));
  }

  assignNewOwner() {
    this.message = 'Assign a new owner from the Owners page. Enter this unit number there.';
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