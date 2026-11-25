import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';

export interface ElectionRow {
  ownerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  unit: number | null;
  units: string;
  electionId: number | null;
  created_at: string | null;
  notes: string | null;
  vote: string | null;
  proxy: string | null;
  group: string | null;
}

@Component({
  selector: 'app-elections',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    SelectModule,
    ButtonModule,
    TextareaModule,
    RadioButtonModule,
    ToastModule,
  ],
  templateUrl: './elections.component.html',
  styleUrl: './elections.component.scss',
  providers: [MessageService],
})
export class ElectionsComponent implements OnInit {
  rows: ElectionRow[] = [];
  filtered: ElectionRow[] = [];
  selected: ElectionRow | null = null;
  loading = false;
  savingContact = false;
  savingGroup = false;
  loadError = '';
  contactMessage = '';
  groupMessage = '';
  error = '';
  search = '';
  votingFor = '0.0';

  canvasGroup = '';
  contactNote = '';
  contactChoice: string | null = null;

  contactFlags = [
    'Gave booklet',
    'Try again later',
    'FOR Us - No Action Needed',
    'FOR Us - Needs follow up',
    'Proxy collected',
    'AGAINST Us',
    'Reset',
  ];

  groupChoices = ['Primary', 'Mail'].map((g) => ({ label: g, value: g }));

  presets = [
    { label: 'All owners', value: 'all' },
    { label: 'No ballot yet', value: 'none' },
    { label: 'Sort by vote', value: 'sortvote' },
    { label: 'Sort by unit', value: 'sortunit' },
    { label: 'Sort by group', value: 'sortgroup' },
  ];
  preset = 'all';

  constructor(
    private supabase: SupabaseService,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.load();
  }

  onSearch() {
    this.applyFilters();
  }

  onPreset() {
    this.applyFilters();
  }

  onRowSelect(event: { data?: ElectionRow | ElectionRow[] }) {
    const row = event?.data;
    if (!row) return;
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
    this.hydrate();
  }

  private hydrate() {
    this.canvasGroup = this.selected?.group ?? '';
    this.contactNote = '';
    this.contactChoice = this.choiceFromRow(this.selected?.vote ?? null, this.selected?.proxy ?? null);
    this.contactMessage = '';
    this.groupMessage = '';
    this.error = '';
  }

  async load() {
    this.loading = true;
    this.loadError = '';
    const [ownersRes, linksRes, ballotsRes, unitsRes] = await Promise.all([
      this.supabase.client.from('owners').select('owner_id, firstname, lastname, email, cell'),
      this.supabase.client.from('unit_owners').select('unit, owner_id'),
      this.supabase.client.from('election').select('id, created_at, name, unit, notes, vote, proxy, "group", owner_id'),
      this.supabase.client.from('units').select('unit, share'),
    ]);
    this.loading = false;
    if (ownersRes.error) {
      this.loadError = ownersRes.error.message;
      this.rows = [];
      this.filtered = [];
      return;
    }

    const unitsByOwner = new Map<string, number[]>();
    for (const link of linksRes.data ?? []) {
      const list = unitsByOwner.get(link.owner_id) ?? [];
      list.push(link.unit);
      unitsByOwner.set(link.owner_id, list);
    }

    const byOwner = new Map<string, any>();
    const byUnit = new Map<number, any>();
    for (const ballot of ballotsRes.data ?? []) {
      const prevOwner = ballot.owner_id ? byOwner.get(ballot.owner_id) : undefined;
      if (ballot.owner_id && (!prevOwner || ballot.id > prevOwner.id)) byOwner.set(ballot.owner_id, ballot);
      const prevUnit = ballot.unit != null ? byUnit.get(ballot.unit) : undefined;
      if (ballot.unit != null && (!prevUnit || ballot.id > prevUnit.id)) byUnit.set(ballot.unit, ballot);
    }

    this.rows = (ownersRes.data ?? []).map((owner: any) => {
      const units = (unitsByOwner.get(owner.owner_id) ?? []).sort((a: number, b: number) => a - b);
      const ballot = byOwner.get(owner.owner_id) ?? (units.length ? byUnit.get(units[0]) : undefined);
      return {
        ownerId: owner.owner_id,
        name: [owner.firstname, owner.lastname].filter(Boolean).join(' ').trim(),
        email: owner.email ?? null,
        phone: owner.cell ?? null,
        unit: units[0] ?? ballot?.unit ?? null,
        units: units.join(', '),
        electionId: ballot?.id ?? null,
        created_at: ballot?.created_at ?? null,
        notes: ballot?.notes ?? null,
        vote: ballot?.vote ?? null,
        proxy: ballot?.proxy ?? null,
        group: ballot?.group ?? null,
      } as ElectionRow;
    });

    this.applyFilters();
    this.votingFor = this.calcVotingFor(unitsRes.data ?? [], unitsByOwner);
    if (this.selected) {
      this.selected = this.rows.find((r) => r.ownerId === this.selected!.ownerId) ?? null;
    }
  }

  private calcVotingFor(
    unitRows: { unit: number; share: number | string | null }[],
    unitsByOwner: Map<string, number[]>
  ) {
    const shareByUnit = new Map<number, number>();
    let total = 0;
    for (const row of unitRows) {
      const share = Number(row.share);
      if (!Number.isFinite(share) || share <= 0) continue;
      shareByUnit.set(row.unit, share);
      total += share;
    }
    if (!total) return '0.0';

    const forUnits = new Set<number>();
    for (const owner of this.rows) {
      if (!(owner.vote ?? '').toUpperCase().includes('FOR')) continue;
      for (const unit of unitsByOwner.get(owner.ownerId) ?? []) forUnits.add(unit);
    }
    let forShare = 0;
    for (const unit of forUnits) forShare += shareByUnit.get(unit) ?? 0;
    return ((forShare / total) * 100).toFixed(1);
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.rows.filter((row) => {
      if (this.preset === 'none' && row.electionId) return false;
      if (!q) return true;
      return (
        row.units.includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (row.vote ?? '').toLowerCase().includes(q) ||
        (row.group ?? '').toLowerCase().includes(q) ||
        (row.notes ?? '').toLowerCase().includes(q)
      );
    });
    const rank = (value: string | null) => {
      const v = (value ?? '').toUpperCase();
      if (v === 'FOR' || v.includes('FOR')) return 0;
      if (v === 'AGAINST') return 1;
      return 9;
    };
    if (this.preset === 'sortvote') {
      this.filtered.sort((a, b) => rank(a.vote) - rank(b.vote) || (a.unit ?? 9999) - (b.unit ?? 9999));
    } else if (this.preset === 'sortunit') {
      this.filtered.sort((a, b) => (a.unit ?? 9999) - (b.unit ?? 9999));
    } else if (this.preset === 'sortgroup') {
      this.filtered.sort(
        (a, b) =>
          (a.group ?? 'ZZZ').localeCompare(b.group ?? 'ZZZ') || (a.unit ?? 9999) - (b.unit ?? 9999)
      );
    } else {
      this.filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
  }

  async saveContact() {
    if (!this.selected) return;
    if (!this.selected.electionId) {
      this.error = 'No ballot row for this owner. Run the seed script.';
      return;
    }
    if (!this.contactChoice && !this.contactNote.trim()) {
      this.error = 'Choose a status or enter a note.';
      return;
    }
    this.savingContact = true;
    this.error = '';
    this.contactMessage = '';
    const lines = [
      `Date: ${this.formatDate(new Date())}`,
      `User: ${this.supabase.user()?.email || 'unknown'}`,
    ];
    if (this.contactChoice) lines.push(`Status: ${this.contactChoice}`);
    if (this.contactNote.trim()) lines.push(`Note: ${this.contactNote.trim()}`);
    const entry = lines.join('\n');
    const existing = (this.selected.notes ?? '').trim();
    const notes = existing ? `${existing}\n\n${entry}` : entry;
    const patch: { notes: string; vote?: string | null; proxy?: string | null } = { notes };
    if (this.contactChoice) {
      const mapped = this.voteProxyFor(this.contactChoice);
      if (mapped.vote !== undefined) patch.vote = mapped.vote;
      if (mapped.proxy !== undefined) patch.proxy = mapped.proxy;
    }
    const { error } = await this.supabase.client
      .from('election')
      .update(patch)
      .eq('id', this.selected.electionId);
    this.savingContact = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.contactNote = '';
    this.contactChoice = null;
    this.contactMessage = 'Contact added.';
    await this.load();
  }

  async saveGroup() {
    if (!this.selected) return;
    if (!this.selected.electionId) {
      this.error = 'No ballot row for this owner. Run the seed script.';
      return;
    }
    this.savingGroup = true;
    this.error = '';
    this.groupMessage = '';
    const { error } = await this.supabase.client
      .from('election')
      .update({ group: this.canvasGroup || null })
      .eq('id', this.selected.electionId);
    this.savingGroup = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.groupMessage = 'Saved.';
    await this.load();
  }

  private voteProxyFor(choice: string): { vote?: string | null; proxy?: string | null } {
    switch (choice) {
      case 'FOR Us - No Action Needed':
        return { vote: 'FOR', proxy: 'NA' };
      case 'FOR Us - Needs follow up':
        return { vote: 'FOR', proxy: 'Promised' };
      case 'Proxy collected':
        return { vote: 'FOR', proxy: 'Collected' };
      case 'AGAINST Us':
        return { vote: 'AGAINST', proxy: null };
      case 'Reset':
        return { vote: null, proxy: null };
      default:
        return {};
    }
  }

  private choiceFromRow(vote: string | null, proxy: string | null): string | null {
    if (proxy === 'Collected') return 'Proxy collected';
    if (proxy === 'Promised') return 'FOR Us - Needs follow up';
    if ((vote ?? '').toUpperCase() === 'FOR') return 'FOR Us - No Action Needed';
    if ((vote ?? '').toUpperCase() === 'AGAINST') return 'AGAINST Us';
    return null;
  }

  private formatDate(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}