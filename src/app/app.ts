import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CopilotAlert,
  FlightGateStatus,
  FlightRecord,
  FlightSocketPayloadLog,
  FlightSocketState,
  FlightsService,
  FlightRunwayRecord,
  FlightRunwayStatus
} from './services/flights.service';
import {
  DisruptionRecord,
  DisruptionsService,
  GateRecord,
  RunwayRecord
} from './services/disruptions.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  private readonly flightsService = inject(FlightsService);
  private readonly disruptionsService = inject(DisruptionsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly title = 'Disruption Copilot';
  protected readonly isControlPage = (globalThis.location?.pathname ?? '/').startsWith('/control');

  protected flights: FlightRecord[] = [];
  protected readonly expandedFlightIds = new Set<number>();
  protected readonly alerts = this.flightsService.getCopilotAlerts();

  protected totalFlights = 0;
  protected delayedFlights = 0;
  protected criticalFlights = 0;
  protected totalPassengers = 0;
  protected flightsUpdateSource: 'REST' | 'SignalR' | 'none' = 'none';
  protected flightsSocketState: FlightSocketState = 'disconnected';
  protected flightsSocketUpdateCount = 0;
  protected flightsSocketLastUpdateAt: string | null = null;
  protected flightsSocketPayloadLogs: FlightSocketPayloadLog[] = [];

  protected disruptions: DisruptionRecord[] = [];
  protected controlResourceType = 'Gate';
  protected gates: GateRecord[] = [];
  protected runways: RunwayRecord[] = [];
  protected controlResourceId = '';
  protected controlSolveId = '1';
  protected controlStatusMessage = '';
  protected controlError = '';
  protected isControlBusy = false;
  protected showOnlyUnresolved = true;

  constructor() {
    if (this.isControlPage) {
      this.loadResourceOptions();
      this.loadDisruptions();
      return;
    }

    this.flightsService.getFlights().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.flights = flights;
      this.flightsUpdateSource = 'REST';
      this.updateMetrics();
    });

    this.flightsService.getFlightsUpdates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.flights = flights;
      this.flightsUpdateSource = 'SignalR';
      this.updateMetrics();
    });

    this.flightsService
      .getFlightsSocketState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.flightsSocketState = state;
      });

    this.flightsService
      .getFlightsSocketUpdateCount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((count) => {
        this.flightsSocketUpdateCount = count;
      });

    this.flightsService
      .getFlightsSocketLastUpdateAt()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((timestamp) => {
        this.flightsSocketLastUpdateAt = timestamp;
      });

    this.flightsService
      .getFlightsSocketPayloadLogs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payloadLogs) => {
        this.flightsSocketPayloadLogs = payloadLogs;
      });

    this.flightsService.startFlightsUpdates();
  }

  protected reloadFlightsFromRest(): void {
    this.flightsService.getFlights().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.flights = flights;
      this.flightsUpdateSource = 'REST';
      this.updateMetrics();
    });
  }

  ngOnDestroy(): void {
    if (!this.isControlPage) {
      this.flightsService.stopFlightsUpdates();
    }
  }

  protected loadGates(): void {
    this.disruptionsService
      .getGates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (gates) => {
          this.gates = gates;
          this.ensureControlResourceSelection();
        },
        error: () => {
          this.controlError = 'Failed to load gates.';
        }
      });
  }

  protected loadRunways(): void {
    this.disruptionsService
      .getRunways()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (runways) => {
          this.runways = runways;
          this.ensureControlResourceSelection();
        },
        error: () => {
          this.controlError = 'Failed to load runways.';
        }
      });
  }

  protected loadResourceOptions(): void {
    if (this.controlResourceType === 'Runway') {
      this.loadRunways();
      return;
    }

    this.loadGates();
  }

  protected onControlResourceTypeChange(resourceType: string): void {
    this.controlResourceType = resourceType;
    this.controlResourceId = '';
    this.loadResourceOptions();
  }

  protected loadDisruptions(): void {
    this.isControlBusy = true;
    this.controlError = '';
    this.controlStatusMessage = '';

    this.disruptionsService
      .getDisruptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (disruptions) => {
          this.disruptions = disruptions;
          this.isControlBusy = false;
        },
        error: () => {
          this.controlError = 'Failed to load disruptions.';
          this.isControlBusy = false;
        }
      });
  }

  protected createDisruption(): void {
    const resourceType = this.controlResourceType.trim();
    const resourceId = Number.parseInt(this.controlResourceId, 10);

    if (!resourceType || !Number.isFinite(resourceId) || resourceId <= 0) {
      this.controlError = 'Resource type and resource id are required.';
      this.controlStatusMessage = '';
      return;
    }

    this.isControlBusy = true;
    this.controlError = '';
    this.controlStatusMessage = '';

    this.disruptionsService
      .createDisruption({ resourceType, resourceId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.controlStatusMessage = `Disruption created for ${resourceType} ${resourceId}.`;
          this.loadDisruptions();
        },
        error: () => {
          this.controlError = 'Failed to create disruption.';
          this.isControlBusy = false;
        }
      });
  }

  protected getGateOptionLabel(gate: GateRecord): string {
    return gate.name;
  }

  protected getRunwayOptionLabel(runway: RunwayRecord): string {
    return runway.name;
  }

  protected getControlResourceOptions(): Array<{ id: number; label: string }> {
    if (this.controlResourceType === 'Runway') {
      return this.runways.map((runway) => ({ id: runway.runwayId, label: this.getRunwayOptionLabel(runway) }));
    }

    return this.gates.map((gate) => ({ id: gate.gateId, label: this.getGateOptionLabel(gate) }));
  }

  protected getControlResourceLabel(): string {
    return this.controlResourceType === 'Runway' ? 'Runway' : 'Gate';
  }

  private ensureControlResourceSelection(): void {
    const options = this.getControlResourceOptions();

    if (!this.controlResourceId && options.length > 0) {
      this.controlResourceId = String(options[0].id);
      return;
    }

    if (this.controlResourceId && !options.some((option) => String(option.id) === this.controlResourceId)) {
      this.controlResourceId = options.length > 0 ? String(options[0].id) : '';
    }
  }

  protected solveDisruption(): void {
    const id = Number.parseInt(this.controlSolveId, 10);

    if (!Number.isFinite(id) || id <= 0) {
      this.controlError = 'Enter a valid disruption id.';
      this.controlStatusMessage = '';
      return;
    }

    this.isControlBusy = true;
    this.controlError = '';
    this.controlStatusMessage = '';

    this.disruptionsService
      .solveDisruption(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.controlStatusMessage = `Disruption ${id} marked as solved.`;
          this.loadDisruptions();
        },
        error: () => {
          this.controlError = `Failed to solve disruption ${id}.`;
          this.isControlBusy = false;
        }
      });
  }

  protected solveDisruptionById(id: number): void {
    this.controlSolveId = String(id);
    this.solveDisruption();
  }

  protected isDisruptionResolved(disruption: DisruptionRecord): boolean {
    const normalized = disruption.status.trim().toLowerCase();
    return normalized === 'resolved' || normalized === 'solved';
  }

  protected getVisibleDisruptions(): DisruptionRecord[] {
    if (!this.showOnlyUnresolved) {
      return this.disruptions;
    }

    return this.disruptions.filter((disruption) => !this.isDisruptionResolved(disruption));
  }

  private updateMetrics(): void {
    this.totalFlights = this.flights.length;
    this.delayedFlights = this.flights.filter((flight) => flight.delayMinutes > 0).length;
    this.criticalFlights = this.flights.filter((flight) => flight.delayMinutes > 15).length;
    this.totalPassengers = this.flights.reduce((sum, flight) => sum + flight.passengerNumber, 0);
  }

  protected formatUtcLabel(isoValue: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    })
      .format(new Date(isoValue))
      .replace(',', '');
  }

  protected getStatusLabel(delayMinutes: number): string {
    if (delayMinutes === 0) {
      return 'On Time';
    }

    if (delayMinutes <= 15) {
      return `+${delayMinutes} mins`;
    }

    return `+${delayMinutes} mins delayed`;
  }

  protected getStatusClass(delayMinutes: number): string {
    if (delayMinutes === 0) {
      return 'status-pill status-pill--green';
    }

    if (delayMinutes <= 15) {
      return 'status-pill status-pill--yellow';
    }

    return 'status-pill status-pill--red';
  }

  protected getGateLabel(gate: FlightRecord['gate']): string {
    return gate.name || gate.gateName || String(gate.gateId ?? '') || 'Unknown Gate';
  }

  protected getGateStatusLabel(gate: FlightRecord['gate']): string {
    return gate.status?.toString().trim() || 'Unknown';
  }

  protected getGateDescription(gate: FlightRecord['gate']): string {
    return gate.description || '';
  }

  protected getGateClass(gate: FlightRecord['gate']): string {
    const normalizedStatus = gate.status?.toString().trim().toLowerCase();

    // Supports both string enums and numeric enum values from backend JSON.
    if (
      normalizedStatus === 'conflict' ||
      normalizedStatus === FlightGateStatus.Conflict.toLowerCase()
    ) {
      return 'gate-label gate-label--conflict';
    }

    if (
      normalizedStatus === 'unavailable' ||
      normalizedStatus === FlightGateStatus.Unavailable.toLowerCase()
    ) {
      return 'gate-label gate-label--unavailable';
    }

    if (
      normalizedStatus === 'ok' ||
      normalizedStatus === FlightGateStatus.Ok.toLowerCase()
    ) {
      return 'gate-label gate-label--ok';
    }

    return 'gate-label';
  }

  protected getRunwayLabel(runway: FlightRecord['runway']): string {
    if (typeof runway === 'string') {
      return runway;
    }

    return runway.name || String(runway.runwayId ?? '') || 'Unknown Runway';
  }

  protected getRunwayStatusLabel(runway: FlightRecord['runway']): string {
    if (typeof runway === 'string') {
      return 'Unknown';
    }

    return runway.status?.toString().trim() || 'Unknown';
  }

  protected getRunwayDescription(runway: FlightRecord['runway']): string {
    if (typeof runway === 'string') {
      return '';
    }

    return runway.description || '';
  }

  protected getRunwayClass(runway: FlightRecord['runway']): string {
    const runwayStatus = typeof runway === 'string' ? '' : this.getNormalizedRunwayStatus(runway);

    if (
      runwayStatus === 'conflict' ||
      runwayStatus === FlightRunwayStatus.Conflict.toLowerCase()
    ) {
      return 'runway-label runway-label--conflict';
    }

    if (
      runwayStatus === 'unavailable' ||
      runwayStatus === FlightRunwayStatus.Unavailable.toLowerCase()
    ) {
      return 'runway-label runway-label--unavailable';
    }

    if (runwayStatus === 'ok' || runwayStatus === FlightRunwayStatus.Ok.toLowerCase()) {
      return 'runway-label runway-label--ok';
    }

    return 'runway-label';
  }

  private getNormalizedRunwayStatus(runway: FlightRunwayRecord): string {
    return runway.status?.toString().trim().toLowerCase() ?? '';
  }

  protected toggleFlightExpanded(flightId: number): void {
    if (this.expandedFlightIds.has(flightId)) {
      this.expandedFlightIds.delete(flightId);
      return;
    }

    this.expandedFlightIds.add(flightId);
  }

  protected isFlightExpanded(flightId: number): boolean {
    return this.expandedFlightIds.has(flightId);
  }

  protected getExpandedToggleLabel(flight: FlightRecord): string {
    if (this.isFlightExpanded(flight.flightId)) {
      return `Hide details for ${flight.flightNumber}`;
    }

    return `Show details for ${flight.flightNumber}`;
  }

  protected formatOptionalUtcLabel(isoValue: string | null): string {
    if (!isoValue) {
      return 'Not available';
    }

    return `${this.formatUtcLabel(isoValue)}Z`;
  }

  protected formatSocketTimestamp(isoValue: string | null): string {
    if (!isoValue) {
      return 'No live update yet';
    }

    return this.formatUtcLabel(isoValue) + 'Z';
  }

  protected getAlertCardClass(alert: CopilotAlert): string {
    return `alert-card alert-card--${alert.tone}`;
  }

  protected getAlertIconLabel(alert: CopilotAlert): string {
    if (alert.tone === 'critical') {
      return 'Critical alert';
    }

    if (alert.tone === 'warning') {
      return 'Warning alert';
    }

    return 'Information alert';
  }

  protected trackByFlightId(_: number, flight: FlightRecord): number {
    return flight.flightId;
  }

  protected trackByAlertId(_: number, alert: CopilotAlert): number {
    return alert.id;
  }
}
