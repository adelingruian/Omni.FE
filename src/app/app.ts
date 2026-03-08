import { Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CopilotAlert,
  ExecuteAiSuggestedActionPayload,
  FlightDisruptionSeverity,
  FlightGateStatus,
  FlightPossibleAction,
  FlightRecord,
  FlightSocketPayloadLog,
  FlightSocketState,
  FlightsService,
  FlightRunwayRecord,
  FlightRunwayStatus
} from './services/flights.service';
import {
  BaggageConveyorBeltRecord,
  DisruptionRecord,
  DisruptionsService,
  GateRecord,
  RunwayRecord
} from './services/disruptions.service';

type FlexibleIdValue = number | string | null | undefined;

type FlightWithFlexibleBaggageFields = FlightRecord & {
  baggageBeltId?: FlexibleIdValue;
  baggageCarouselId?: FlexibleIdValue;
  baggageConveyorBelt?: {
    id?: FlexibleIdValue;
    baggageConveyorBeltId?: FlexibleIdValue;
  } | null;
};

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
  protected suggestedActions: FlightPossibleAction[] = [];
  protected suggestedActionsPayloadText = '[]';
  protected suggestedActionsByFlightId: Record<number, FlightPossibleAction> = {};
  protected aiSuggestionsLoading = false;
  protected executingSuggestionsByFlightId: Record<number, boolean> = {};
  protected departureFilter = 'all';
  protected arrivalFilter = 'all';
  protected showOnlyAffectedFlights = false;

  protected disruptions: DisruptionRecord[] = [];
  protected controlResourceType = 'Gate';
  protected gates: GateRecord[] = [];
  protected runways: RunwayRecord[] = [];
  protected baggageConveyorBelts: BaggageConveyorBeltRecord[] = [];
  protected controlResourceOptions: Array<{ id: number; label: string }> = [];
  protected controlResourceId = '';
  protected readonly controlHourOptions = Array.from({ length: 24 }, (_, hour) => {
    const paddedHour = String(hour).padStart(2, '0');

    return `${paddedHour}:00`;
  });
  protected controlStartHour = '';
  protected controlEndHour = '';
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
      this.applyFlightsUpdate(flights, 'REST');
    });

    this.flightsService.getFlightsUpdates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((flights) => {
      this.applyFlightsUpdate(flights, 'SignalR');
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
      this.applyFlightsUpdate(flights, 'REST');
    });
  }

  private applyFlightsUpdate(flights: FlightRecord[], source: 'REST' | 'SignalR'): void {
    this.flights = flights;
    this.flightsUpdateSource = source;
    this.updateMetrics();
    this.refreshAiSuggestedActions();
  }

  private refreshAiSuggestedActions(): void {
    this.aiSuggestionsLoading = true;

    this.flightsService
      .getAiSuggestedActions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actions) => {
          this.setSuggestedActions(actions);
          this.executingSuggestionsByFlightId = {};
          this.aiSuggestionsLoading = false;
        },
        error: () => {
          // Keep the latest known actions when API refresh fails.
          this.aiSuggestionsLoading = false;
        }
      });
  }

  private setSuggestedActions(actions: FlightPossibleAction[]): void {
    this.suggestedActions = actions;
    this.suggestedActionsPayloadText = JSON.stringify(actions, null, 2);
    this.suggestedActionsByFlightId = actions.reduce<Record<number, FlightPossibleAction>>((acc, action) => {
      if (Number.isFinite(action.flightId) && action.flightId > 0) {
        acc[action.flightId] = action;
      }

      return acc;
    }, {});
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
          this.updateControlResourceOptionsFromCache();
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
          this.updateControlResourceOptionsFromCache();
          this.ensureControlResourceSelection();
        },
        error: () => {
          this.controlError = 'Failed to load runways.';
        }
      });
  }

  protected loadResourceOptions(): void {
    this.updateControlResourceOptionsFromCache();

    if (this.controlResourceType === 'Runway') {
      this.loadRunways();
      return;
    }

    if (this.controlResourceType === 'BaggageConveyorBelt') {
      this.loadBaggageConveyorBelts();
      return;
    }

    this.loadGates();
  }

  protected onControlResourceTypeChange(resourceType: string): void {
    this.controlResourceType = resourceType;
    this.controlResourceId = '';
    this.updateControlResourceOptionsFromCache();
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
    const hasStartHour = this.controlStartHour.trim().length > 0;
    const hasEndHour = this.controlEndHour.trim().length > 0;
    const hasCustomWindow = hasStartHour || hasEndHour;
    const startIso = hasStartHour ? this.buildUtcIsoFromHour(this.controlStartHour) : null;
    const endIso = hasEndHour ? this.buildUtcIsoFromHour(this.controlEndHour) : null;

    if (!resourceType || !Number.isFinite(resourceId) || resourceId <= 0) {
      this.controlError = 'Resource type and resource id are required.';
      this.controlStatusMessage = '';
      return;
    }

    if (hasStartHour !== hasEndHour) {
      this.controlError = 'Provide both start and end hour, or leave both empty.';
      this.controlStatusMessage = '';
      return;
    }

    if (hasCustomWindow && (!startIso || !endIso)) {
      this.controlError = 'Invalid start or end hour value.';
      this.controlStatusMessage = '';
      return;
    }

    if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
      this.controlError = 'End hour must be after start hour.';
      this.controlStatusMessage = '';
      return;
    }

    this.isControlBusy = true;
    this.controlError = '';
    this.controlStatusMessage = '';

    const payload: {
      resourceType: string;
      resourceId: number;
      startsAt?: string;
      endsAt?: string;
    } = { resourceType, resourceId };

    if (startIso && endIso) {
      payload.startsAt = startIso;
      payload.endsAt = endIso;
    }

    this.disruptionsService
      .createDisruption(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.controlStatusMessage = startIso && endIso
            ? `Disruption created for ${resourceType} ${resourceId} (${this.controlStartHour}-${this.controlEndHour} UTC).`
            : `Disruption created for ${resourceType} ${resourceId}.`;
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

  protected loadBaggageConveyorBelts(): void {
    this.disruptionsService
      .getBaggageConveyorBelts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (baggageConveyorBelts) => {
          this.baggageConveyorBelts = baggageConveyorBelts;
          this.updateControlResourceOptionsFromCache();
          this.ensureControlResourceSelection();
        },
        error: () => {
          this.controlError = 'Failed to load baggage conveyor belts.';
        }
      });
  }

  protected getBaggageConveyorBeltOptionLabel(belt: BaggageConveyorBeltRecord): string {
    return belt.name || `Belt ${belt.baggageConveyorBeltId}`;
  }

  protected getControlResourceOptions(): Array<{ id: number; label: string }> {
    return this.controlResourceOptions;
  }

  private updateControlResourceOptionsFromCache(): void {
    if (this.controlResourceType === 'Runway') {
      this.controlResourceOptions = this.runways.map((runway) => ({
        id: runway.runwayId,
        label: this.getRunwayOptionLabel(runway)
      }));
      return;
    }

    if (this.controlResourceType === 'BaggageConveyorBelt') {
      this.controlResourceOptions = this.baggageConveyorBelts.map((belt) => ({
        id: belt.baggageConveyorBeltId,
        label: this.getBaggageConveyorBeltOptionLabel(belt)
      }));
      return;
    }

    this.controlResourceOptions = this.gates.map((gate) => ({
      id: gate.gateId,
      label: this.getGateOptionLabel(gate)
    }));
  }

  protected getControlResourceLabel(): string {
    if (this.controlResourceType === 'Runway') {
      return 'Runway';
    }

    if (this.controlResourceType === 'BaggageConveyorBelt') {
      return 'Baggage Conveyor Belt';
    }

    return 'Gate';
  }

  private ensureControlResourceSelection(): void {
    const options = this.controlResourceOptions;

    if (!this.controlResourceId && options.length > 0) {
      this.controlResourceId = String(options[0].id);
      return;
    }

    if (this.controlResourceId && !options.some((option) => String(option.id) === this.controlResourceId)) {
      this.controlResourceId = options.length > 0 ? String(options[0].id) : '';
    }
  }

  protected solveDisruptionById(id: number): void {
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

  protected resetDatabase(): void {
    const shouldReset = globalThis.confirm(
      'Reset the database to initial data? This will remove current disruptions and restore seeded records.'
    );

    if (!shouldReset) {
      return;
    }

    this.isControlBusy = true;
    this.controlError = '';
    this.controlStatusMessage = '';

    this.disruptionsService
      .resetDatabase()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.controlStartHour = '';
          this.controlEndHour = '';
          this.controlStatusMessage = 'Database reset completed.';
          this.loadResourceOptions();
          this.loadDisruptions();
        },
        error: () => {
          this.controlError = 'Failed to reset database.';
          this.isControlBusy = false;
        }
      });
  }

  private buildUtcIsoFromHour(hourValue: string): string | null {
    if (!hourValue) {
      return null;
    }

    const today = new Date();
    const [hoursText, minutesText] = hourValue.split(':');
    const hours = Number.parseInt(hoursText ?? '', 10);
    const minutes = Number.parseInt(minutesText ?? '', 10);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes, 0)).toISOString();
  }

  protected isDisruptionResolved(disruption: DisruptionRecord): boolean {
    if (!disruption.endsAt) {
      return false;
    }

    const endsAtTimestamp = Date.parse(disruption.endsAt);

    if (!Number.isFinite(endsAtTimestamp)) {
      return false;
    }

    return endsAtTimestamp <= Date.now();
  }

  protected formatBackendUtcDateTime(isoValue: string | null): string {
    if (!isoValue) {
      return '-';
    }

    const directParts = this.getIsoDateTimeParts(isoValue);

    if (directParts) {
      return `${directParts.year}-${directParts.month}-${directParts.day} ${directParts.hour}:${directParts.minute}:${directParts.second}`;
    }

    const timestamp = Date.parse(isoValue);

    if (!Number.isFinite(timestamp)) {
      return isoValue;
    }

    const isoUtc = new Date(timestamp).toISOString();
    return isoUtc.slice(0, 19).replace('T', ' ');
  }

  protected getBackendUtcRawValue(isoValue: string | null): string {
    return isoValue ?? '-';
  }

  protected getVisibleDisruptions(): DisruptionRecord[] {
    if (!this.showOnlyUnresolved) {
      return this.disruptions;
    }

    return this.disruptions.filter((disruption) => !this.isDisruptionResolved(disruption));
  }

  protected getVisibleFlights(): FlightRecord[] {
    return this.flights.filter((flight) => {
      const matchesDeparture = this.departureFilter === 'all' || flight.origin === this.departureFilter;
      const matchesArrival = this.arrivalFilter === 'all' || flight.destination === this.arrivalFilter;
      const isAffected = this.isFlightAffected(flight);
      const matchesAffected = !this.showOnlyAffectedFlights || isAffected;

      return matchesDeparture && matchesArrival && matchesAffected;
    });
  }

  protected getDepartureFilterOptions(): string[] {
    return [...new Set(this.flights.map((flight) => flight.origin))].sort((a, b) => a.localeCompare(b));
  }

  protected getArrivalFilterOptions(): string[] {
    return [...new Set(this.flights.map((flight) => flight.destination))].sort((a, b) => a.localeCompare(b));
  }

  protected filterOmrDepartures(): void {
    if (this.departureFilter === 'OMR' && this.arrivalFilter === 'all') {
      this.departureFilter = 'all';
      return;
    }

    this.departureFilter = 'OMR';
    this.arrivalFilter = 'all';
  }

  protected filterOmrArrivals(): void {
    if (this.arrivalFilter === 'OMR' && this.departureFilter === 'all') {
      this.arrivalFilter = 'all';
      return;
    }

    this.arrivalFilter = 'OMR';
    this.departureFilter = 'all';
  }

  private updateMetrics(): void {
    this.totalFlights = this.flights.length;
    this.delayedFlights = this.flights.filter((flight) => this.getComputedDelayMinutes(flight) > 0).length;
    this.criticalFlights = this.flights.filter((flight) => this.getComputedDelayMinutes(flight) > 15).length;
    this.totalPassengers = this.flights.reduce((sum, flight) => sum + flight.passengerNumber, 0);
  }

  protected formatUtcLabel(isoValue: string): string {
    const directParts = this.getIsoDateTimeParts(isoValue);

    if (directParts) {
      return `${directParts.year}-${directParts.month}-${directParts.day} ${directParts.hour}:${directParts.minute}`;
    }

    const timestamp = Date.parse(isoValue);

    if (!Number.isFinite(timestamp)) {
      return isoValue;
    }

    const isoUtc = new Date(timestamp).toISOString();
    return isoUtc.slice(0, 16).replace('T', ' ');
  }

  protected formatTime24h(isoValue: string): string {
    const directParts = this.getIsoDateTimeParts(isoValue);

    if (directParts) {
      return `${directParts.hour}:${directParts.minute}`;
    }

    const timestamp = Date.parse(isoValue);

    if (!Number.isFinite(timestamp)) {
      return isoValue;
    }

    const isoUtc = new Date(timestamp).toISOString();
    return isoUtc.slice(11, 16);
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

  protected getDisruptionScorePoints(flight: FlightRecord): number {
    return flight.disruptionScore?.totalPoints ?? 0;
  }

  protected getDisruptionRiskLabel(flight: FlightRecord): FlightDisruptionSeverity {
    return flight.disruptionScore?.severity ?? 'On Time';
  }

  protected getDisruptionScoreClass(flight: FlightRecord): string {
    const risk = this.getDisruptionRiskLabel(flight);

    if (risk === 'CRITICAL') {
      return 'risk-badge risk-badge--critical';
    }

    if (risk === 'High Risk') {
      return 'risk-badge risk-badge--high';
    }

    if (risk === 'Medium Risk') {
      return 'risk-badge risk-badge--medium';
    }

    if (risk === 'Low Risk') {
      return 'risk-badge risk-badge--low';
    }

    return 'risk-badge risk-badge--ontime';
  }

  protected isCriticalRisk(flight: FlightRecord): boolean {
    return this.getDisruptionRiskLabel(flight) === 'CRITICAL';
  }

  protected getComputedDelayMinutes(flight: FlightRecord): number {
    const departureDelay = this.getDelayMinutesFromTimes(flight.scheduledDeparture, flight.actualDeparture) ?? 0;
    const arrivalDelay = this.getDelayMinutesFromTimes(flight.scheduledArrival, flight.actualArrival) ?? 0;
    return Math.max(departureDelay, arrivalDelay);
  }

  protected getDepartureDelayText(flight: FlightRecord): string {
    const delay = this.getDelayMinutesFromTimes(flight.scheduledDeparture, flight.actualDeparture);
    return this.formatDelayMinutes(delay);
  }

  protected getArrivalDelayText(flight: FlightRecord): string {
    const delay = this.getDelayMinutesFromTimes(flight.scheduledArrival, flight.actualArrival);
    return this.formatDelayMinutes(delay);
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

  protected getBaggageCarouselLabel(flight: FlightRecord): string {
    const beltId = this.getBaggageBeltId(flight);

    if (!beltId) {
      return '';
    }

    return `Carousel ${beltId}`;
  }

  protected getBaggageDetailsLabel(flight: FlightRecord): string {
    const beltId = this.getBaggageBeltId(flight);
    return beltId ? `on belt ${beltId}` : 'without belt assignment';
  }

  protected getSuggestedActionLabel(flightId: number): string {
    const action = this.suggestedActionsByFlightId[flightId];

    if (!action) {
      return '-';
    }

    if (action.description?.trim()) {
      return action.description.trim();
    }

    if (action.actionType || action.reason) {
      const actionTypeLabel = this.getActionTypeLabel(action.actionType);
      const reasonLabel = action.reason?.trim();
      const estimatedDelayReductionMinutes = action.estimatedDelayReductionMinutes;
      const delayReduction =
        typeof estimatedDelayReductionMinutes === 'number' && estimatedDelayReductionMinutes > 0
        ? ` (-${estimatedDelayReductionMinutes} mins)`
        : '';

      if (reasonLabel) {
        return `${actionTypeLabel}: ${reasonLabel}${delayReduction}`;
      }

      return `${actionTypeLabel}${delayReduction}`;
    }

    const possibleLabels = [
      action.suggestedAction,
      action.recommendedAction,
      action.recommandedAction,
      action.action,
      action.recommendation,
      action.message,
      action.description
    ];

    const firstText = possibleLabels.find((value) => typeof value === 'string' && value.trim().length > 0);

    if (firstText?.trim()) {
      return firstText.trim();
    }

    const arrayLabel = action.recommendedActions ?? action.recommandedActions;

    if (Array.isArray(arrayLabel) && arrayLabel.length > 0) {
      return arrayLabel.join(' | ');
    }

    return '-';
  }

  protected getSuggestedActionHint(flightId: number): string {
    if (this.isExecutingSuggestion(flightId)) {
      return 'Applying and waiting for fresh data...';
    }

    if (this.aiSuggestionsLoading && !this.hasSuggestedAction(flightId)) {
      return 'AI is thinking...';
    }

    const action = this.suggestedActionsByFlightId[flightId];

    if (!action) {
      return 'No suggested action';
    }

    if (this.isEscalationOnlyAction(action)) {
      return 'Ops review only (no auto-execute)';
    }

    return 'Click bubble to execute';
  }

  protected getSuggestedActionBubbleClass(flightId: number): string {
    const action = this.suggestedActionsByFlightId[flightId];

    if (!action) {
      return 'ai-speech-bubble ai-speech-bubble--empty';
    }

    if (this.isEscalationOnlyAction(action)) {
      return 'ai-speech-bubble ai-speech-bubble--ops-review';
    }

    if (this.canExecuteSuggestion(flightId)) {
      return 'ai-speech-bubble ai-speech-bubble--clickable';
    }

    return 'ai-speech-bubble';
  }

  protected hasSuggestedAction(flightId: number): boolean {
    return Boolean(this.suggestedActionsByFlightId[flightId]);
  }

  protected isExecutingSuggestion(flightId: number): boolean {
    return this.executingSuggestionsByFlightId[flightId] === true;
  }

  protected canExecuteSuggestion(flightId: number): boolean {
    if (this.isExecutingSuggestion(flightId)) {
      return false;
    }

    const action = this.suggestedActionsByFlightId[flightId];

    if (!action || this.isEscalationOnlyAction(action)) {
      return false;
    }

    return true;
  }

  protected executeSuggestedAction(flightId: number): void {
    const action = this.suggestedActionsByFlightId[flightId];
    const executePayload = action ? this.buildExecuteSuggestedActionPayload(action) : null;

    if (!action || !executePayload || !this.canExecuteSuggestion(flightId)) {
      return;
    }

    this.executingSuggestionsByFlightId = {
      ...this.executingSuggestionsByFlightId,
      [flightId]: true
    };

    this.flightsService
      .executeAiSuggestedAction(executePayload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reloadFlightsFromRest();
        },
        error: () => {
          this.executingSuggestionsByFlightId = {
            ...this.executingSuggestionsByFlightId,
            [flightId]: false
          };
        }
      });
  }

  protected onSuggestedActionBubbleClick(flightId: number): void {
    if (!this.canExecuteSuggestion(flightId)) {
      return;
    }

    this.executeSuggestedAction(flightId);
  }

  private isEscalationOnlyAction(action: FlightPossibleAction): boolean {
    const actionType = this.normalizeActionType(this.getActionToolName(action) ?? action.actionType);
    return actionType === 'escalate_ops_review';
  }

  private buildExecuteSuggestedActionPayload(action: FlightPossibleAction): ExecuteAiSuggestedActionPayload | null {
    const toolName = this.getActionToolName(action);

    if (!toolName) {
      return null;
    }

    return {
      toolName,
      parameters: action.tool?.parameters ?? {}
    };
  }

  private getActionToolName(action: FlightPossibleAction): string | null {
    return action.tool?.name?.trim() || null;
  }

  private normalizeActionType(actionType: string | undefined): string {
    return actionType?.trim().replaceAll(' ', '_').replaceAll('-', '_').toLowerCase() ?? '';
  }

  private getActionTypeLabel(actionType: string | undefined): string {
    const normalizedType = this.normalizeActionType(actionType);

    if (!normalizedType) {
      return 'Suggested action';
    }

    if (normalizedType === 'reassign_gate') {
      return 'Reassign Gate';
    }

    if (normalizedType === 'reassign_runway') {
      return 'Reassign Runway';
    }

    if (normalizedType === 'reassign_belt') {
      return 'Reassign Belt';
    }

    if (normalizedType === 'delay_pushback') {
      return 'Delay Pushback';
    }

    if (normalizedType === 'escalate_ops_review') {
      return 'Escalate Ops Review';
    }

    return actionType?.trim() || 'Suggested action';
  }

  private isFlightAffected(flight: FlightRecord): boolean {
    const disruptionRisk = this.getDisruptionRiskLabel(flight);

    if (disruptionRisk !== 'On Time') {
      return true;
    }

    if (this.getComputedDelayMinutes(flight) > 0) {
      return true;
    }

    return this.isGateAffected(flight.gate) || this.isRunwayAffected(flight.runway);
  }

  private getBaggageBeltId(flight: FlightRecord): number | null {
    const candidate = flight as FlightWithFlexibleBaggageFields;

    const possibleValues = [
      candidate.baggageConveyorBeltId,
      candidate.baggageBeltId,
      candidate.baggageCarouselId,
      candidate.baggageConveyorBelt?.baggageConveyorBeltId,
      candidate.baggageConveyorBelt?.id
    ];

    for (const value of possibleValues) {
      const numericValue = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

      if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
      }
    }

    return null;
  }

  private isGateAffected(gate: FlightRecord['gate']): boolean {
    const status = this.normalizeStatus(gate.status);
    return status === 'conflict' || status === 'unavailable' || status === '0' || status === '1';
  }

  private isRunwayAffected(runway: FlightRecord['runway']): boolean {
    if (typeof runway === 'string') {
      return false;
    }

    const status = this.normalizeStatus(runway.status);
    return status === 'conflict' || status === 'unavailable' || status === '0' || status === '1';
  }

  private normalizeStatus(statusValue: unknown): string {
    return statusValue?.toString().trim().toLowerCase() ?? '';
  }

  private getDelayMinutesFromTimes(scheduledIso: string | null, actualIso: string | null): number | null {
    if (!scheduledIso || !actualIso) {
      return null;
    }

    const scheduled = Date.parse(scheduledIso);
    const actual = Date.parse(actualIso);

    if (!Number.isFinite(scheduled) || !Number.isFinite(actual)) {
      return null;
    }

    return Math.max(0, Math.round((actual - scheduled) / 60000));
  }

  private formatDelayMinutes(delayMinutes: number | null): string {
    if (delayMinutes === null || delayMinutes <= 0) {
      return '';
    }

    return `+${delayMinutes} mins`;
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

  private getIsoDateTimeParts(isoValue: string): {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
  } | null {
    const isoPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))/;
    const match = isoPattern.exec(isoValue);

    if (!match) {
      return null;
    }

    return {
      year: match[1],
      month: match[2],
      day: match[3],
      hour: match[4],
      minute: match[5],
      second: match[6] ?? '00'
    };
  }
}
