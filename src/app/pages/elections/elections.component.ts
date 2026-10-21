import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
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
    CheckboxModule,
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
  savingVote = false;
  savingGroup = false;
  loadError = '';
  contactMessage = '';
  voteMessage = '';
  groupMessage = '';
  error = '';
  search = '';
  votingFor = '0.0';

  vote = '';
  proxyCollected = false;
  canvasGroup = '';
  contactNote = '';
  flags: Record<string, boolean> = {};

  contactFlags = [
  'No Answer',
  'Hostile (Against us)',
  'Indifferent',
  'Ally (For us)',
  'Gave flyer',
  'Send WhatsApp invite',
  'Corrected info',
];

  voteChoices = [
    { label: 'FOR in person', value: 'FOR in person' },
    { label: 'FOR by proxy', value: 'FOR by proxy' },
    { label: 'Quorum Only', value: 'Quorum Only' },
    { label: 'AGAINST', value: 'AGAINST' },
  ];

  groupChoices = ['A', 'B', 'C', 'D', 'E', 'F'].map((g) => ({ label: g, value: g }));

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
  ) {
    this.clearFlags();
  }

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

  private clearFlags() {
    this.flags = {};
    for (const flag of this.contactFlags) this.flags[flag] = false;
  }

  private hydrate() {
    this.vote = this.selected?.vote ?? '';
    this.proxyCollected = (this.selected?.proxy ?? '').toUpperCase() === 'YES';
    this.canvasGroup = this.selected?.group ?? '';
    this.contactNote = '';
    this.clearFlags();
    this.contactMessage = '';
    this.voteMessage = '';
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
      const order = ['for in person', 'for by proxy', 'quorum only', 'against'];
      const i = order.indexOf((value ?? '').toLowerCase());
      return i === -1 ? 9 : i;
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
    const checked = this.contactFlags.filter((flag) => this.flags[flag]);
    if (!checked.length && !this.contactNote.trim()) {
      this.error = 'Check at least one item or enter a note.';
      return;
    }
    this.savingContact = true;
    this.error = '';
    this.contactMessage = '';
    const lines = [
      `Date: ${this.formatDate(new Date())}`,
      `User: ${this.supabase.user()?.email || 'unknown'}`,
    ];
    if (checked.length) lines.push(`Flags: ${checked.join(', ')}`);
    if (this.contactNote.trim()) lines.push(`Note: ${this.contactNote.trim()}`);
    const entry = lines.join('\n');
    const existing = (this.selected.notes ?? '').trim();
    const notes = existing ? `${existing}\n\n${entry}` : entry;
    const { error } = await this.supabase.client
      .from('election')
      .update({ notes })
      .eq('id', this.selected.electionId);
    this.savingContact = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.contactNote = '';
    this.clearFlags();
    this.contactMessage = 'Contact added.';
    await this.load();
  }

  async saveVote() {
    if (!this.selected) return;
    if (!this.selected.electionId) {
      this.error = 'No ballot row for this owner. Run the seed script.';
      return;
    }
    this.savingVote = true;
    this.error = '';
    this.voteMessage = '';
    const { error } = await this.supabase.client
      .from('election')
      .update({
        vote: this.vote || null,
        proxy: this.proxyCollected ? 'YES' : null,
      })
      .eq('id', this.selected.electionId);
    this.savingVote = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.voteMessage = 'Saved.';
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

  private formatDate(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}