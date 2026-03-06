import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CopilotAlert, FlightRecord, FlightsService } from './services/flights.service';
import { DisruptionRecord, DisruptionsService, GateRecord } from './services/disruptions.service';

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
  protected readonly alerts = this.flightsService.getCopilotAlerts();

  protected totalFlights = 0;
  protected delayedFlights = 0;
  protected criticalFlights = 0;
  protected totalPassengers = 0;

  protected disruptions: DisruptionRecord[] = [];
  protected controlResourceType = 'Gate';
  protected gates: GateRecord[] = [];
  protected controlResourceId = '';
  protected controlSolveId = '1';
  protected controlStatusMessage = '';
  protected controlError = '';
  protected isControlBusy = false;

  constructor() {
    if (this.isControlPage) {
      this.loadGates();
      this.loadDisruptions();
      return;
    }

    this.flightsService.getFlights().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.flights = flights;
      this.updateMetrics();
    });

    this.flightsService.getFlightsUpdates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.flights = flights;
      this.updateMetrics();
    });

    this.flightsService.startFlightsUpdates();
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

          if (!this.controlResourceId && gates.length > 0) {
            this.controlResourceId = gates[0].name;
          }
        },
        error: () => {
          this.controlError = 'Failed to load gates.';
        }
      });
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
    const resourceId = this.controlResourceId.trim();

    if (!resourceType || !resourceId) {
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
    return gate.gateId;
  }

  protected getGateClass(gate: FlightRecord['gate']): string {
    const isDisrupted = gate.status.toLowerCase() === 'disrupted';
    return isDisrupted ? 'gate-label gate-label--disrupted' : 'gate-label';
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
